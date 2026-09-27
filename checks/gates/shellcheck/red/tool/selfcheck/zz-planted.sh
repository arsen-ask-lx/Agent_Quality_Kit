#!/usr/bin/env bash
# Образец для доказательства гейта shellcheck: подстановка без кавычек режет имена с пробелами.
for F in $(ls tool); do echo "$F"; done
