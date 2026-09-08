// tool/selfcheck/units-level.mjs — проверки уровня и доказательства гейтов.
//
// ОТДЕЛЬНЫМ ФАЙЛОМ, а не в units.mjs: тот перерос собственный предел в 500 строк, и поймал
// это наш же гейт `file-size-limit` на прогоне. Шов по смыслу: здесь всё, что программа
// вычитывает ИЗ МАНИФЕСТА и объявляет о проекте, — ступень, доказательство гейтов и раскладка
// (где правила, методички, точка входа). Общее у них одно и важное: ответ обязан приходить из
// манифеста, а не из умолчаний, совпадающих с нашими собственными значениями.
//
//   node --test tool/selfcheck/units-level.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { commandFor } from "../lib/prove.mjs";
import { assessLevel, layoutChecks, unknownKeys, KNOWN_KEYS } from "../lib/manifest.mjs";

// --- доказательство гейтов ------------------------------------------------------------
// ЗАЧЕМ. Ступень AQK-2 называлась «гейты доказаны» и проверяла существование двух папок.
// Проект с тремя гейтами `true` проходил порог AQK-3 — проверено прогоном на пустой папке.
test("обёртка храповика снимается перед подстановкой каталога", () => {
  // Иначе доказательство гоняет гейт вместе с реестром долга, и реестр перезаписывается
  // находками из ОБРАЗЦА. На живом проекте это стёрло бы долг целиком.
  const cmd = "bash ratchets/_ratchet.sh ratchets/x.txt bash gates/x/check.sh .";
  assert.equal(commandFor(cmd, "gates/x/red"), "bash gates/x/check.sh gates/x/red");
});

test("каталог подставляется вместо последнего слова команды", () => {
  assert.equal(commandFor("bash gates/x/check.sh .", "gates/x/green"), "bash gates/x/check.sh gates/x/green");
  assert.equal(commandFor("ruff check --select T20 .", "gates/x/red"), "ruff check --select T20 gates/x/red");
});

test("ступень выше первой не берётся без доказательства", async () => {
  const man = {
    aqk: "0.6.0", entry: [], rules: ".", samples: ".", ratchets: ".", lessons: ".",
    gates: { lint: "true" },
  };
  const withoutProof = await assessLevel(man, null);
  const withFailedProof = await assessLevel(man, { ok: false });
  const withProof = await assessLevel(man, { ok: true });
  // Без доказательства ступень не выполнена, но помечена «не проверяли» — это разные состояния.
  assert.equal(withoutProof.steps[2].ok, false);
  assert.equal(withoutProof.steps[2].needsProof, true);
  assert.equal(withFailedProof.steps[2].ok, false);
  assert.equal(withFailedProof.steps[2].needsProof, false);
  assert.equal(withProof.steps[2].ok, true);
});

test("обёртка родного инструмента едет вместе с каталогом образца", () => {
  // `_native.sh <каталог> <команда…>` прячет пути gates/*/red|green. Оставленный «.» спрятал бы
  // ровно то, что образец обязан показать, — красный прошёл бы зелёным.
  const cmd = "bash gates/_native.sh . ruff check --select T20 .";
  assert.equal(
    commandFor(cmd, "gates/x/red"),
    "bash gates/_native.sh gates/x/red ruff check --select T20 gates/x/red"
  );
});

test("обе обёртки снимаются вместе", () => {
  const cmd = "bash ratchets/_ratchet.sh ratchets/x.txt bash gates/_native.sh . ruff check .";
  assert.equal(
    commandFor(cmd, "gates/x/green"),
    "bash gates/_native.sh gates/x/green ruff check gates/x/green"
  );
});

// Отзыв второго пользователя, 2026-09-08: на Windows `prove` объявил два ИСПРАВНЫХ гейта
// сломанными. Путь к образцу собирался `path.join`, то есть `gates\x\red`, и уезжал в строку
// команды — а её исполняет `sh`, который обратный слэш съедает как экранирование: остаётся
// `gatesxred`. Каталога нет → `find` молчит → код 0 → «промолчал на КРАСНОМ образце».
// Проверка идёт здесь, а не в самом сборщике пути: `commandFor` — единственная дверь, через
// которую каталог попадает в оболочку, и закрывать её надо там, кто бы путь ни собрал.
test("каталог образца уходит в оболочку с прямыми слэшами", () => {
  assert.equal(
    commandFor("bash gates/x/check.sh .", "gates\\x\\red"),
    "bash gates/x/check.sh gates/x/red",
  );
});

// Тот же путь едет ВТОРЫМ адресом — первым аргументом фильтра образцов. Пропустить его значит
// починить половину: фильтр не узнает образец и спрячет ровно то, что образец обязан показать.
test("обёртка родного инструмента тоже получает прямые слэши", () => {
  assert.equal(
    commandFor("bash gates/_native.sh . npx knip --directory .", "gates\\x\\red"),
    "bash gates/_native.sh gates/x/red npx knip --directory gates/x/red",
  );
});

// --- где у проекта лежат правила и методички ----------------------------------
// Отзыв второго пользователя, 2026-09-08: `doctor` рисовал два красных креста за сделанное.
// У проекта `rules: .temper/rules`, правила на месте, гейт entry-links-exist их видит, уровень
// AQK-1 считается ПО МАНИФЕСТУ — а список в шапке проверял литеральные `.aqk/rules` и
// `.aqk/docs` и советовал сделать сделанное. Уровень и вывод расходились в разные стороны:
// хуже неверного вывода только вывод, который расходится с собственным вердиктом.
test("каталог правил берётся из манифеста, а не из умолчания", () => {
  const paths = layoutChecks({ rules: ".temper/rules" }, false).map(([p]) => p);
  assert.ok(paths.includes(".temper/rules"), "путь из манифеста обязан попасть в список");
  assert.ok(!paths.includes(".aqk/rules"), "умолчание обязано уступить манифесту");
});

// Поля `docs:` не было вовсе: перенести методички было НЕКУДА, и проект, разложивший их иначе,
// получал крест без единого способа его снять. Умолчание остаётся для тех, кто поля не завёл.
test("каталог методичек тоже берётся из манифеста", () => {
  const paths = layoutChecks({ docs: ".temper/docs" }, false).map(([p]) => p);
  assert.ok(paths.includes(".temper/docs"));
  assert.ok(!paths.includes(".aqk/docs"));
});

test("без манифеста остаются умолчания", () => {
  const paths = layoutChecks(null, false).map(([p]) => p);
  assert.ok(paths.includes(".aqk/rules") && paths.includes(".aqk/docs"));
});

// В самом комплекте лежат оригиналы, а не разложенная копия: копия завтра разошлась бы с ними.
test("внутри комплекта проверяются его собственные каталоги", () => {
  const paths = layoutChecks({ rules: "kit/rules" }, true).map(([p]) => p);
  assert.ok(paths.includes("kit/rules") && paths.includes("kit/docs"));
});

// Поле, которое программа читает, обязано быть в списке известных: иначе манифест с ним
// получает предупреждение «неизвестное поле» за то, что работает.
test("docs — известное поле манифеста", () => {
  assert.ok(KNOWN_KEYS.includes("docs"));
  assert.deepEqual(unknownKeys({ docs: ".aqk/docs" }), []);
});
