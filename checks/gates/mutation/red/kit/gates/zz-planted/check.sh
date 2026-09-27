#!/usr/bin/env sh
# Образец: держится за конец строки — windows-перевод строки его ослепляет.
if grep -rqE "BAD$" "$1"; then echo "нашёл BAD"; exit 1; fi
exit 0
