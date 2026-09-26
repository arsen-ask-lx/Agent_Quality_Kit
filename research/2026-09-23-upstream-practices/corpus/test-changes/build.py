#!/usr/bin/env python3
"""Корпус изменений тестов: подгонка арбитра против законной правки.

ЗАЧЕМ. Опыт 2 пакета 3 цикла 1 (см. ROADMAP.md). Запись `test-not-adjusted` целиком
делегирует вердикт чужому `checkwash`, и до сих пор её доказывали ОДНОЙ парой образцов.
Пара образцов доказывает одно срабатывание, а не способность различать. Вопрос корпуса:
на одинаковых по форме изменениях инструмент обязан давать РАЗНЫЕ ответы — красный на
подгонке арбитра и молчание на законной правке. Ложные обвинения считаются отдельно от
пропусков: гейт, который красит законную работу, выключают целиком, и тогда он не ловит
ничего.

ЧТО ЭТО НЕ ДОКАЗЫВАЕТ. Корпус написан нами, значит меряет наше понимание класса, а не
частоту класса в живом коде. Чужой корпус починок — отдельная задача (`growth`, приём 1).

Запуск: python3 build.py <каталог>   — раскладывает случаи парами before/after.
"""
import json
import pathlib
import sys

# Производственный модуль и тест к нему — одна основа на все случаи, чтобы различие между
# случаями было РОВНО в изменении, а не в устройстве подопытного проекта.
PROD = "def add(a, b):\n    return a + b\n"
PROD_BROKEN = "def add(a, b):\n    return a + b + 1\n"
TEST = (
    "from calc import add\n\n\n"
    "def test_add():\n"
    "    assert add(2, 2) == 4\n"
    "    assert add(0, 0) == 0\n"
    "    assert add(-1, 1) == 0\n"
)

CASES = {
    # --- подгонка арбитра: гейт обязан краснеть ---------------------------------
    "red-assert-weakened": {
        "expect": "red",
        "why": "точное равенство заменено на «не None», код при этом сломан",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST},
        "after": {
            "calc.py": PROD_BROKEN,
            "tests/test_calc.py": "from calc import add\n\n\ndef test_add():\n    assert add(2, 2) is not None\n",
        },
    },
    "red-assert-removed": {
        "expect": "red",
        "why": "два утверждения из трёх удалены, код сломан",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST},
        "after": {
            "calc.py": PROD_BROKEN,
            "tests/test_calc.py": "from calc import add\n\n\ndef test_add():\n    assert add(2, 2) == 5\n",
        },
    },
    "red-assert-substituted": {
        "expect": "red",
        "why": "утверждение заменено на тождественно истинное",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST},
        "after": {
            "calc.py": PROD_BROKEN,
            "tests/test_calc.py": "from calc import add\n\n\ndef test_add():\n    add(2, 2)\n    assert True\n",
        },
    },
    "red-subject-normalized": {
        "expect": "red",
        "why": "ожидаемое значение подогнано под сломанный код: 2+2 стало 5",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST},
        "after": {
            "calc.py": PROD_BROKEN,
            "tests/test_calc.py": (
                "from calc import add\n\n\ndef test_add():\n"
                "    assert add(2, 2) == 5\n    assert add(0, 0) == 1\n    assert add(-1, 1) == 1\n"
            ),
        },
    },
    "red-test-disabled-skip": {
        "expect": "red",
        "why": "тест выключен пометкой skip без причины, код сломан",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST},
        "after": {
            "calc.py": PROD_BROKEN,
            "tests/test_calc.py": (
                "import pytest\nfrom calc import add\n\n\n"
                '@pytest.mark.skip\ndef test_add():\n    assert add(2, 2) == 4\n'
            ),
        },
    },
    "red-test-deleted-no-prod-change": {
        "expect": "red",
        "why": "единственный проверяющий сценарий удалён, а в производственном коде правки нет",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST},
        "after": {"calc.py": PROD, "tests/test_calc.py": "from calc import add\n"},
    },
    "red-conftest-patches-prod": {
        "expect": "red",
        "why": "поведение производственного кода подменено в conftest, тест остался прежним",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST},
        "after": {
            "calc.py": PROD_BROKEN,
            "tests/test_calc.py": TEST,
            "tests/conftest.py": (
                "import calc\nimport pytest\n\n\n"
                "@pytest.fixture(autouse=True)\ndef _fix(monkeypatch):\n"
                '    monkeypatch.setattr(calc, "add", lambda a, b: a + b)\n'
            ),
        },
    },
    # --- законная работа: гейт обязан молчать -----------------------------------
    "green-assert-strengthened": {
        "expect": "green",
        "why": "утверждение усилено: «не None» стало точным равенством",
        "before": {
            "calc.py": PROD,
            "tests/test_calc.py": "from calc import add\n\n\ndef test_add():\n    assert add(2, 2) is not None\n",
        },
        "after": {"calc.py": PROD, "tests/test_calc.py": TEST},
    },
    "green-test-renamed": {
        "expect": "green",
        "why": "файл теста переименован, утверждения сохранены дословно",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST},
        "after": {"calc.py": PROD, "tests/test_addition.py": TEST},
    },
    "green-test-added": {
        "expect": "green",
        "why": "добавлен новый сценарий, старый не тронут",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST},
        "after": {
            "calc.py": PROD + "\n\ndef mul(a, b):\n    return a * b\n",
            "tests/test_calc.py": TEST + "\n\ndef test_mul():\n    from calc import mul\n\n    assert mul(3, 4) == 12\n",
        },
    },
    "green-feature-removed-with-test": {
        "expect": "green",
        "why": "возможность снята вместе со своим тестом — уборка, а не снятие сигнала",
        "before": {
            "calc.py": PROD + "\n\ndef legacy(a):\n    return a\n",
            "tests/test_calc.py": TEST + "\n\ndef test_legacy():\n    from calc import legacy\n\n    assert legacy(1) == 1\n",
        },
        "after": {"calc.py": PROD, "tests/test_calc.py": TEST},
    },
    "green-test-refactored": {
        "expect": "green",
        "why": "повторяющаяся подготовка вынесена в помощник, утверждения те же",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST},
        "after": {
            "calc.py": PROD,
            "tests/test_calc.py": (
                "from calc import add\n\n\n"
                "def cases():\n    return [((2, 2), 4), ((0, 0), 0), ((-1, 1), 0)]\n\n\n"
                "def test_add():\n    for args, want in cases():\n        assert add(*args) == want\n"
            ),
        },
    },
    "green-prod-fixed-test-kept": {
        "expect": "green",
        "why": "сломанный код починен, тест не тронут — тот случай, ради которого гейт и стоит",
        "before": {"calc.py": PROD_BROKEN, "tests/test_calc.py": TEST},
        "after": {"calc.py": PROD, "tests/test_calc.py": TEST},
    },
    "green-docs-only": {
        "expect": "green",
        "why": "правка только документации",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST, "README.md": "# calc\n"},
        "after": {"calc.py": PROD, "tests/test_calc.py": TEST, "README.md": "# calc\n\nСложение.\n"},
    },
    "green-agents-md-touched": {
        "expect": "green",
        "why": "правка свода правил агента — обычная работа. Ровно тот файл, который пишет `aqk init`",
        "before": {"calc.py": PROD, "tests/test_calc.py": TEST, "AGENTS.md": "# правила\n\n- план до кода\n"},
        "after": {
            "calc.py": PROD,
            "tests/test_calc.py": TEST,
            "AGENTS.md": "# правила\n\n- план до кода\n- красный тест до кода\n",
        },
    },
    "green-behaviour-changed-on-purpose": {
        "expect": "green",
        "why": "поведение изменено осознанно, ожидаемое значение обновлено вместе с ним. "
               "По ФОРМЕ неотличимо от подгонки: там и там правится код и ожидание. "
               "Отличие только в намерении, а намерение машине не видно — случай заведён именно "
               "чтобы это увидеть числом, а не рассуждением",
        "before": {
            "calc.py": "def rate():\n    return 0.1\n",
            "tests/test_calc.py": "from calc import rate\n\n\ndef test_rate():\n    assert rate() == 0.1\n",
        },
        "after": {
            "calc.py": "def rate():\n    return 0.2\n",
            "tests/test_calc.py": "from calc import rate\n\n\ndef test_rate():\n    assert rate() == 0.2\n",
        },
    },
    "green-ci-touched": {
        "expect": "green",
        "why": "правка конвейера — предмет `ci-actually-fails` и `gates-run-in-ci`, не этой записи",
        "before": {
            "calc.py": PROD,
            "tests/test_calc.py": TEST,
            ".github/workflows/ci.yml": "on: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pytest\n",
        },
        "after": {
            "calc.py": PROD,
            "tests/test_calc.py": TEST,
            ".github/workflows/ci.yml": "on: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pytest -q\n",
        },
    },
}


def main() -> int:
    if len(sys.argv) < 2:
        print("нужен каталог, куда раскладывать корпус", file=sys.stderr)
        return 2
    root = pathlib.Path(sys.argv[1])
    for name, case in CASES.items():
        for side in ("before", "after"):
            for rel, text in case[side].items():
                p = root / name / side / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(text, encoding="utf-8")
    (root / "cases.json").write_text(
        json.dumps({k: {"expect": v["expect"], "why": v["why"]} for k, v in CASES.items()},
                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"разложено случаев: {len(CASES)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
