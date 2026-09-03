package main

import "log/slog"

func handle(x int) int {
	slog.Debug("got", "x", x)
	return x + 1
}
