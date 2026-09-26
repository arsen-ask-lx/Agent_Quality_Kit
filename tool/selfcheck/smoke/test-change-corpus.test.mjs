// Переписанное ожидание теста называется вслух, даже когда не роняет прогон.
//
// ОТКУДА ВОПРОС. Опыт 2 пакета 3 цикла 1: корпус из 16 изменений тестов
// (`research/2026-09-23-upstream-practices/corpus/test-changes/`) — подгонка арбитра против
// законной правки. Замер 2026-09-26 показал, что самая чистая форма подгонки проезжала молча:
// три ожидания переписаны под сломанный код (2+2 стало 5), гейт вернул НОЛЬ и не сказал ничего.
// `checkwash` эту правку видит и называет `EXPECTED_VALUE_CHANGED`; в списке правил гейта её
// не было. То есть пропуск был нашей настройкой, а не слепотой инструмента.
//
// ПОЧЕМУ НАЗЫВАЕМ, А НЕ КРАСИМ. Замер цены политики (`corpus/test-changes/policy.py`):
//   как сейчас                      — поймано 6 из 7, ложных обвинений 2 из 9;
//   +EXPECTED_VALUE_CHANGED красит  — поймано 7 из 7, ложных обвинений 3 из 9.
// Третье ложное обвинение — `green-behaviour-changed-on-purpose`: поведение изменено осознанно,
// ожидание обновлено вместе с ним. По ФОРМЕ это то же самое, что подгонка, и машине различить
// их нечем: отличие только в намерении. В живом проекте такая правка — самая частая из всех,
// и гейт, который её блокирует, выключают целиком — тогда он не поймает и остальные шесть.
// Поэтому вердикт остаётся прежним, а строка появляется: молчание неотличимо от «чисто», и
// именно это запрещает свод.
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { project, run } from "./_fixture.mjs";
import { whichSync } from "../../lib/repo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GATE = String(join(ROOT, "kit", "gates", "test-not-adjusted", "check.sh")).replace(/\\/g, "/");

const PROD = "def add(a, b):\n    return a + b\n";
const PROD_BROKEN = "def add(a, b):\n    return a + b + 1\n";
const TEST_OK = "from calc import add\n\n\ndef test_add():\n    assert add(2, 2) == 4\n    assert add(0, 0) == 0\n";
// Ожидания переписаны под сломанный код. Утверждений столько же, форма та же, сила та же —
// изменились только числа. Ни одно правило про удаление или ослабление тут не срабатывает.
const TEST_NORMALIZED = "from calc import add\n\n\ndef test_add():\n    assert add(2, 2) == 5\n    assert add(0, 0) == 1\n";

// Гейт умеет режим образца: рядом лежат before/ и after/, он сам собирает одноразовый репозиторий.
// Им и пользуемся — то же, чем гейт доказывается приёмкой, без второй оснастки под то же самое.
const pair = (t, before, after) =>
  project(t, {
    ...Object.fromEntries(Object.entries(before).map(([k, v]) => [`case/before/${k}`, v])),
    ...Object.fromEntries(Object.entries(after).map(([k, v]) => [`case/after/${k}`, v])),
  }, { git: false });

const runGate = (p) => run(p, "bash", [GATE, "case"]);
const skip = whichSync("checkwash") ? false : "нет checkwash";

test("переписанное ожидание названо, но прогон не роняет", { skip }, (t) => {
  const p = pair(t,
    { "calc.py": PROD, "tests/test_calc.py": TEST_OK },
    { "calc.py": PROD_BROKEN, "tests/test_calc.py": TEST_NORMALIZED });
  const r = runGate(p);

  // Вердикт прежний — это решение, принятое по замеру цены, а не упущение.
  assert.equal(r.code, 0, `вердикт обязан остаться зелёным, а стал ${r.code}:\n${r.out}`);
  // Но названо. Без строки гейт неотличим от «посмотрел и чисто», а он посмотрел и НАШЁЛ.
  assert.match(r.out, /ожидан/i, `переписанное ожидание не названо вовсе:\n${r.out}`);
  // Метка совета — не украшение: по ней прогон решает, показывать ли строку зелёного гейта
  // (`splitAdvice` в `tool/lib/scope.mjs`). Без метки сообщение уходит в никуда.
  assert.match(r.out, /^\s*почини\s*:/mi, `нет метки совета — строку зелёного гейта прогон не покажет:\n${r.out}`);
});

test("там, где ожидания не трогали, лишней строки нет", { skip }, (t) => {
  // Законная работа: добавлен сценарий, старые ожидания на месте. Строка про переписанные
  // ожидания здесь была бы шумом, а шум в зелёном выводе читают один раз.
  const p = pair(t,
    { "calc.py": PROD, "tests/test_calc.py": TEST_OK },
    { "calc.py": PROD + "\n\ndef mul(a, b):\n    return a * b\n",
      "tests/test_calc.py": TEST_OK + "\n\ndef test_mul():\n    from calc import mul\n\n    assert mul(3, 4) == 12\n" });
  const r = runGate(p);
  assert.equal(r.code, 0, `законная правка обязана молчать, а дала ${r.code}:\n${r.out}`);
  assert.doesNotMatch(r.out, /ожидан/i, `лишняя строка на законной правке:\n${r.out}`);
});

test("подгонка арбитра по-прежнему роняет прогон", { skip }, (t) => {
  // Контроль: новая необязательная строка не должна была ослабить то, что гейт ловил раньше.
  const p = pair(t,
    { "calc.py": PROD, "tests/test_calc.py": TEST_OK },
    { "calc.py": PROD_BROKEN, "tests/test_calc.py": "from calc import add\n\n\ndef test_add():\n    assert add(2, 2) is not None\n" });
  const r = runGate(p);
  assert.equal(r.code, 1, `ослабленное утверждение обязано ронять прогон, а дало ${r.code}:\n${r.out}`);
});
