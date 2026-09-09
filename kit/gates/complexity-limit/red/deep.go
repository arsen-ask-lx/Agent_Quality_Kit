package svc

func Route(a, b, c, d int) int {
	if a > 0 {
		if b > 0 {
			for i := 0; i < c; i++ {
				switch d {
				case 1:
					if a > b {
						return 1
					}
				}
			}
		}
	}
	return 0
}
