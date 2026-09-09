// Проверки про договор с чужим кодом: кто держит спецификацию API и умеет ли держатель
// провалиться. Переехали из smoke.sh 2026-09-09 первыми — как доказательство переезда.
//
// ЗАМЕР, ИЗ КОТОРОГО ОНИ ВЗЯЛИСЬ. Стенд, где сервер врёт в каждом поле ответа:
//   spectral (spectral:oas)             код 0  — нет контакта, описания, тегов
//   schemathesis, умолчания             код 1  — три нарушения схемы в ответах
//   schemathesis -c not_a_server_error  код 0  — «18 из 18 прошли»
//   oasdiff breaking без --fail-on      код 0  — печатает ломающую правку и молчит кодом
import test from "node:test";
import assert from "node:assert/strict";
import { project, aqk, gate } from "./_fixture.mjs";

const SPEC = "openapi: 3.0.3\ninfo: { title: t, version: 1.0.0 }\npaths: {}\n";
const workflow = (steps) =>
  `name: ci\non: [push]\njobs:\n  contract:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;

// ЛОВУШКА, ИЗ-ЗА КОТОРОЙ ЗАМЕР ЧУТЬ НЕ ОКАЗАЛСЯ ЛОЖНО-ЗЕЛЁНЫМ: шаг с именем «Spec lint»
// краснеет не потому, что узнали инструмент, а потому что в имени есть слово-примета.
// Поэтому здесь у шагов НЕТ слов-подсказок — проверяется опознание инструмента.
test("обезвреженные проверки контракта API опознаются как проверки", (t) => {
  const p = project(t, {
    ".github/workflows/api.yml": workflow(
      "      - name: соответствие сервера схеме\n" +
      "        continue-on-error: true\n" +
      "        run: schemathesis run openapi.yaml --url http://localhost:8000\n" +
      "      - name: ломающие изменения\n" +
      "        continue-on-error: true\n" +
      "        run: oasdiff breaking base.yaml openapi.yaml --fail-on ERR\n" +
      "      - name: ожидания потребителей\n" +
      "        continue-on-error: true\n" +
      "        run: pact-broker can-i-deploy --pacticipant web\n"),
  });
  const r = gate(p, "ci-actually-fails");
  assert.equal(r.code, 1, `три шага под continue-on-error прошли как чистые:\n${r.out}`);
});

// У записи две красные ветки, и вторая тоньше первой. Проверяются ОБЕ формы сужения и
// мутация: снял сужение — гейт обязан замолчать, иначе краснеет он не от этого.
test("арбитр, который не может провалиться, краснеет в обеих формах", (t) => {
  const mk = (tail) => ({
    "openapi.yaml": SPEC,
    ".github/workflows/ci.yml": workflow(
      `      - run: schemathesis run openapi.yaml --url http://localhost:8000${tail}\n`),
  });
  for (const narrow of [" -c not_a_server_error", " --checks not_a_server_error"]) {
    const p = project(t, mk(narrow));
    assert.equal(gate(p, "api-contract-has-arbiter").code, 1, `сужение «${narrow}» не опознано`);
  }
  const full = project(t, mk(""));
  assert.equal(gate(full, "api-contract-has-arbiter").code, 0, "полный арбитр покраснел");

  const loud = project(t, {
    "openapi.yaml": SPEC,
    ".github/workflows/ci.yml": workflow(
      "      - run: schemathesis run openapi.yaml --url http://localhost:8000\n" +
      "      - run: oasdiff breaking base.yaml openapi.yaml\n"),
  });
  assert.equal(gate(loud, "api-contract-has-arbiter").code, 1,
    "oasdiff без --fail-on печатает находки и выходит с нулём — это не проверка");
});

// НАЙДЕНО АУДИТОМ ФИЧ, а не образцами: красный и зелёный образцы лежат по одному, а в
// настоящем проекте записи стоят рядом — и соседняя `ci-actually-fails` держит в своём
// check.sh список запускалок со ВСЕМИ инструментами про API разом. Проверка находила её и
// выдавала ложное ЗЕЛЁНОЕ там, где договор не держал никто.
test("держателем не считается определение соседней записи", (t) => {
  const p = project(t, {
    "src/a.py": "def s():\n    return 1\n",
    "openapi.yaml": SPEC,
    ".github/workflows/ci.yml": workflow("      - run: pytest\n"),
  });
  aqk(p, "init");
  aqk(p, "add", "ci-actually-fails");
  aqk(p, "add", "api-contract-has-arbiter");
  const r = gate(p, "api-contract-has-arbiter");
  assert.equal(r.code, 1, `договор без держателя прошёл зелёным:\n${r.out}`);
  // Второй дефект того же прогона: `find` без завершающего -print печатал обойдённые каталоги.
  assert.doesNotMatch(r.out, /\.git|\.aqk/, `в списке спецификаций каталоги:\n${r.out}`);
});
