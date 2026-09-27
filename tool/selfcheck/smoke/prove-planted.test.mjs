// tool/selfcheck/smoke/prove-planted.test.mjs — доказать можно ЛЮБУЮ команду проекта, а не
// только ту, что кончается каталогом.
//
// ЗАЧЕМ. `prove` подставлял каталог образца вместо последнего слова команды. Настоящие проекты
// объявляют `npm run lint`, `make check`, `ruff check` со своим конфигом — подставлять некуда, и
// всё это называлось «недоказуемым». Живой проект владельца 2026-09-27: 45 гейтов, из них
// доказать было можно только скопированные из каталога. Как раз то, что человек поставил сам —
// линтер, типы, тесты, — проверки «умеет ли покраснеть» не получало вовсе.
//
// КАК. Проект копируется во временный каталог (та же песочница, что у `probe`), дерево красного
// образца кладётся поверх копии по своим путям, и команда запускается КАК ЕСТЬ. Сначала — на
// чистой копии: команда, красная без подсадки, ничего не доказывает, и это называется, а не
// засчитывается. Рабочее дерево не трогается.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { project, aqk, tail } from "./_fixture.mjs";

// Проверка ищет слово BAD в src/. Команда не кончается каталогом — подставить образец некуда.
const CHECK = "if grep -rq BAD src; then echo 'BAD найдено'; exit 1; fi\n";

function manifest(gates) {
  return ["aqk: 1", "entry:", "  - AGENTS.md", "samples: gates", "gates:",
    ...Object.entries(gates).map(([n, c]) => `  ${n}: "${c}"`), ""].join("\n");
}

// Цвета снимаются: у тусклой строки имя приклеено к коду цвета («…2mwords»), и `\b` его не видит.
const lines = (out) => out.replace(/\x1b\[[0-9;]*m/g, "").split("\n");

const samples = (name) => ({
  [`gates/${name}/red/src/planted.txt`]: "BAD\n",
  [`gates/${name}/green/src/planted.txt`]: "fine\n",
});

test("команда без каталога доказывается подсадкой в копию проекта", (t) => {
  const p = project(t, {
    "AGENTS.md": "# a\n", "check.sh": CHECK, "src/app.txt": "ok\n",
    ".aqk.yml": manifest({ words: "sh check.sh", lazy: "sh -c 'exit 0'" }),
    ...samples("words"), ...samples("lazy"),
  });
  const r = aqk(p, "prove");
  const words = lines(r.out).find((l) => /\bwords\b/.test(l)) || "";
  const lazy = lines(r.out).find((l) => /\blazy\b/.test(l)) || "";
  assert.match(words, /✔/, `настоящая проверка не доказана:\n${tail(r.out, 12)}`);
  assert.match(lazy, /✘/, `проверка, которая всегда «ок», не названа сломанной:\n${tail(r.out, 12)}`);
  assert.equal(r.code, 1, "есть сломанная проверка — код возврата обязан быть 1");

  // Рабочее дерево не тронуто: подсадка живёт только в копии.
  assert.ok(!existsSync(join(p.dir, "src", "planted.txt")), "образец остался в проекте");
  assert.equal(readFileSync(join(p.dir, "src", "app.txt"), "utf8"), "ok\n");
});

test("команда, красная уже на чистом проекте, не доказана и не сломана — названа", (t) => {
  const p = project(t, {
    "AGENTS.md": "# a\n", "check.sh": CHECK, "src/app.txt": "BAD уже здесь\n",
    ".aqk.yml": manifest({ words: "sh check.sh" }), ...samples("words"),
  });
  const r = aqk(p, "prove");
  const words = lines(r.out).find((l) => /\bwords\b/.test(l)) || "";
  assert.doesNotMatch(words, /✔/, "красная до подсадки засчитана доказанной");
  assert.match(words, /без подсадки|чистом/, `причина не названа: ${words}`);
});

// ОБРАЗЦЫ СОБСТВЕННЫХ ПРОВЕРОК ПРОЕКТА — ОТДЕЛЬНО ОТ КАТАЛОГА. `samples:` указывает на каталог
// записей (у самого AQK это `kit/gates`), и образец для `npm test` или `make check` там читался бы
// как новая запись каталога. Принято снаружи так же: у semgrep тест правила лежит рядом с правилом,
// а не в общей куче. Поле `own_samples:` — где лежат образцы проверок, написанных проектом.
test("образцы своих проверок лежат в own_samples и доказывают гейт", (t) => {
  const p = project(t, {
    "AGENTS.md": "# a\n", "check.sh": CHECK, "src/app.txt": "ok\n",
    ".aqk.yml": manifest({ words: "sh check.sh" }).replace("samples: gates", "samples: gates\nown_samples: checks/samples"),
    "checks/samples/words/red/src/planted.txt": "BAD\n",
    "checks/samples/words/green/src/planted.txt": "fine\n",
  });
  const r = aqk(p, "prove");
  const words = lines(r.out).find((l) => /\bwords\b/.test(l)) || "";
  assert.match(words, /✔/, `образцы из own_samples не найдены:\n${tail(r.out, 12)}`);
  const d = aqk(p, "doctor");
  assert.doesNotMatch(d.out, /неизвестн\S* пол\S*[^\n]*own_samples|own_samples[^\n]*неизвестн/, "own_samples назван неизвестным полем");
});
