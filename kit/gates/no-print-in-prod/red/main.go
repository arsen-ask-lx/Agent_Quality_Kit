package main

import "fmt"

func handle(x int) int {
	fmt.Println("got", x)
	return x + 1
}
