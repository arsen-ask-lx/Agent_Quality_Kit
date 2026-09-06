#!/usr/bin/env bash
# tool/selfcheck/mutation.sh — доказывает, что гейт краснеет на КЛАССЕ примеров, а не на одном.
#
# ЗАЧЕМ. Пара образцов red/green доказывает ровно одно срабатывание. Одна проверка `.aqkignore`
# была написана так, что не могла покраснеть, и это заметили случайно; сколько таких ещё —
# неизвестно (PROJECT.md §9 п.4). Гейт, который не может упасть, неотличим от работающего.
#
# КАК. Образец меняется так, что вердикт МЕНЯТЬСЯ НЕ ОБЯЗАН: сдвиг строк, перевод строк в
# windows-формат. Если после такой правки красный позеленел или зелёный покраснел — гейт
# опирался не на то, что заявляет. Идея взята из мутационного тестирования правил в
# millionco/react-doctor (packages/fuzz), приёмы — свои, зависимостей не добавлено.
#
# ПОЧЕМУ ИМЕННО ЭТИ ДВЕ. Обе сохраняют смысл по построению и обе бьют по настоящим болям:
# сдвиг строк ловит проверки, привязанные к номеру строки; CRLF ловит те, что сломаются на
# windows-чекауте, — а конвейера на Windows у нас до сих пор нет (PROJECT.md §9 п.2).
#
#   bash tool/selfcheck/mutation.sh

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CAT="$ROOT/kit/gates"
PASS=0; FAIL=0; SKIP=0

ok()   { printf '  \033[32m✔\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✘\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); }
skip() { printf '  \033[2m·\033[0m  %s\n' "$1"; SKIP=$((SKIP+1)); }

printf '\n\033[1mtool/selfcheck/mutation.sh\033[0m\n\n'
[ -d "$CAT" ] || { echo "  каталога гейтов нет"; exit 1; }

# Сдвиг строк: три пустые строки в начало каждого файла. Номера всех строк меняются, смысл —
# нет. Проверка, которая помнит номер, а не содержание, здесь и ломается.
mutate_blank_lines() {
  find "$1" -type f 2>/dev/null | while IFS= read -r F; do
    { printf '\n\n\n'; cat "$F"; } > "$F.mut" && mv "$F.mut" "$F"
  done
}

# Перевод строк в windows-формат. Смысл файла тот же, но у проверки, которая ищет по «конец
# строки», перед ним оказывается \r — и она перестаёт видеть то, что видела.
mutate_crlf() {
  find "$1" -type f 2>/dev/null | while IFS= read -r F; do
    sed 's/$/\r/' "$F" > "$F.mut" && mv "$F.mut" "$F"
  done
}

for GATE in "$CAT"/*/; do
  SLUG="$(basename "$GATE")"
  YML="$GATE/gate.yml"
  [ -f "$YML" ] || continue
  [ -d "$GATE/red" ] && [ -d "$GATE/green" ] || continue

  # Только переносимый рецепт. Родные инструменты требуют установленной программы, и на
  # машине без неё «не проверено» было бы неотличимо от «проверено»: ровно та тишина, против
  # которой всё это написано. Записи без `any` называются вслух, а не пропускаются молча.
  RECIPE="$(sed -n 's/^[[:space:]]*any:[[:space:]]*\(.*\)$/\1/p' "$YML" | head -1)"
  if [ -z "$RECIPE" ]; then
    skip "$SLUG: нет переносимого рецепта — мутации проверять нечем"
    continue
  fi

  GATE_FAILED=0
  for MUT in blank_lines crlf; do
    for KIND in red green; do
      TMP="$(mktemp -d)"
      cp -r "$GATE/$KIND" "$TMP/$KIND"
      "mutate_$MUT" "$TMP/$KIND"

      # {gate} остаётся настоящим каталогом гейта: мутируется ОБРАЗЕЦ, а не сама проверка.
      CMD="$(echo "$RECIPE" | sed "s|{gate}|$GATE|; s|{dir}|$TMP/$KIND|")"
      OUT="$(eval "$CMD" 2>&1)"; CODE=$?
      rm -rf "$TMP"

      if [ "$KIND" = red ] && [ "$CODE" -eq 0 ]; then
        bad "$SLUG / $MUT: красный образец позеленел — гейт держался за то, чего не заявляет"
        GATE_FAILED=1
      elif [ "$KIND" = green ] && [ "$CODE" -ne 0 ]; then
        bad "$SLUG / $MUT: зелёный образец покраснел — гейт ругается на исправный код"
        printf '     \033[2m%s\033[0m\n' "$(printf '%s' "$OUT" | head -1 | cut -c1-100)"
        GATE_FAILED=1
      fi
    done
  done
  [ "$GATE_FAILED" -eq 0 ] && ok "$SLUG: вердикт пережил сдвиг строк и windows-переносы"
done

printf '\n'
if [ "$FAIL" -eq 0 ]; then
  printf '  \033[32mвердикт устойчив: %s гейтов\033[0m' "$PASS"
else
  printf '  \033[31mвердикт поплыл: %s\033[0m' "$FAIL"
fi
[ "$SKIP" -gt 0 ] && printf '  \033[2m(без переносимого рецепта: %s)\033[0m' "$SKIP"
printf '\n\n'
exit "$FAIL"
