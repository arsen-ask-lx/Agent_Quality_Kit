#!/usr/bin/env sh
# Протокол shell-обёрток: 0 clean, 1 finding, 2 cannot.
# Соответствие tool/lib/execution.mjs проверяется на всех 256 exit-кодах.
# Имена — программы, а не текст вывода. Вывод при ошибке не делает прогон состоявшимся.
aqk_exit_verdict() {
  [ "$2" -eq 0 ] && return 0
  case "${1##*/}" in
    vulture) [ "$2" -eq 3 ] && return 1 ;;
    pylint) [ "$2" -gt 0 ] && [ "$2" -lt 32 ] && return 1 ;;
    *) [ "$2" -eq 1 ] && return 1 ;;
  esac
  return 2
}
