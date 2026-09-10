export function route(a, b, c, d) {
  if (a > 0) {
    if (b > 0) {
      for (let i = 0; i < c; i++) {
        switch (d) {
          case 1:
            if (a > b) {
              return 1;
            }
        }
      }
    }
  }
  return 0;
}
