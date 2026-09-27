#!/usr/bin/env sh
# Образец: то же, но устойчиво к переводу строки.
if grep -rq "BAD" "$1"; then echo "нашёл BAD"; exit 1; fi
exit 0
