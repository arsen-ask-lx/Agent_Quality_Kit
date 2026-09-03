#!/usr/bin/env sh
# Что сканирующие проверки не читают. Общий список: разъехавшись по шести проверкам, он
# однажды окажется полным в одной и дырявым в другой.
#
# ПОЧЕМУ ЭТО ВАЖНЕЕ, ЧЕМ КАЖЕТСЯ. На настоящем проекте из 36 тысяч файлов 1722 находки из 1831
# пришли из чужого кода в окружении. Гейт, который на 94% состоит из чужих нарушений, читать
# никто не будет — его выключат.

SKIP_NAMES=".git .aqk node_modules .venv venv env __pycache__ .mypy_cache .pytest_cache
.tox .ruff_cache site-packages dist build target out .next .nuxt .svelte-kit coverage
htmlcov vendor bower_components .gradle .idea .vscode"

# Образцы гейтов — искусственный код по построению: красный сломан нарочно, зелёный бывает
# вырожденным (двести одинаковых строк, чтобы показать предел размера). Сканировать их — значит
# ловить то, что положил не человек. Исключение снимается, когда цель проверки — сам образец.
sample_dirs() {
  case "${1:-}" in
    */red|*/red/|*/green|*/green/) : ;;
    *) printf 'red green' ;;
  esac
}

# Для grep: --exclude-dir на каждое имя.
skip_grep() {
  for N in $SKIP_NAMES $(sample_dirs "${1:-}"); do printf -- '--exclude-dir=%s ' "$N"; done
}

# Для find: -name X -prune -o … Красные образцы исключаются отдельно, только когда цель
# проверки — не сам образец.
skip_find() {
  for N in $SKIP_NAMES $(sample_dirs "${1:-}"); do printf -- '-name %s -prune -o ' "$N"; done
}
