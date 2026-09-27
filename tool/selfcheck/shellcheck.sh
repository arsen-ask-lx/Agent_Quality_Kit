#!/usr/bin/env bash
# Скрипты оболочки комплекта — под shellcheck.
#
# ЗАЧЕМ. Половина комплекта — оболочка: записи каталога, храповик, прогоны. Её дефекты тихие:
# `exit "$FAIL"` превращал два провала в «не смогли проверить», `printf | grep -q` под pipefail
# плавал от загрузки машины, here-документ перебивал трубу, и скрипт исследования насчитывал ноль
# при любых данных. Всё это нашлось 2026-09-27 — случайно и руками. Решение владельца того же дня:
# всё, что AQK советует ставить, стоит и у нас. shellcheck — готовый арбитр ровно этого класса.
#
# ДОЛГ — ПОД ХРАПОВИКОМ. Первый прогон нашёл 88 замечаний; два исправлены сразу (одно — настоящая
# ошибка в research/corpus), остальное — в ratchets/shellcheck.txt: старое проходит, новое нет.
#
# ИНСТРУМЕНТ. `shellcheck` из PATH (конвейер ставит его `pipx install shellcheck-py==0.11.0.1`),
# иначе — та же версия через `uvx`. Нет ни того, ни другого — код 2, «не смогли проверить»: без
# инструмента молчание прочиталось бы как «замечаний нет».
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 2

if command -v shellcheck >/dev/null 2>&1; then
  SC=(shellcheck)
elif command -v uvx >/dev/null 2>&1; then
  SC=(uvx --quiet --from shellcheck-py==0.11.0.1 shellcheck)
else
  echo "не смогли проверить: нет shellcheck — pipx install shellcheck-py==0.11.0.1"
  exit 2
fi

# Те же файлы, что у syntax.sh: отслеживаемые и новые, без образцов гейтов — красные образцы
# обязаны быть неправильными, это не наш код.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  LIST="$(git ls-files --cached --others --exclude-standard -- '*.sh')"
else
  LIST="$(find . -type d \( -name node_modules -o -name .git \) -prune -o -type f -name '*.sh' -print | sed 's|^\./||')"
fi
FILES=()
while IFS= read -r F; do
  [ -n "$F" ] && [ -f "$F" ] && FILES+=("$F")
done <<<"$(grep -vE '(^|/)gates/[^/]+/(red|green)(/|$)' <<<"$LIST")"

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "не смогли проверить: не найдено ни одного .sh — обход файлов сломан, а не скрипты чисты"
  exit 2
fi

# Формат gcc — одна строка на замечание «файл:строка:колонка: уровень: текст [SCxxxx]». Храповик
# убирает номер строки из ключа, и сдвиг соседних строк не читается как новое замечание.
"${SC[@]}" -f gcc "${FILES[@]}"
CODE=$?
# Коды shellcheck: 0 — чисто, 1 — замечания, 2+ — не смог разобрать файлы или ключи. Второе
# находкой не выдаётся.
case "$CODE" in
  0) exit 0 ;;
  1) echo "почини: замечание shellcheck — его код в скобках, объяснение: https://www.shellcheck.net/wiki/<код>"; exit 1 ;;
  *) echo "не смогли проверить: shellcheck вышел с кодом $CODE"; exit 2 ;;
esac
