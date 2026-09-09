pub fn route(a: i32, b: i32, c: i32, d: i32) -> i32 {
    if a > 0 {
        if b > 0 {
            for i in 0..c {
                match d {
                    1 => {
                        if a > b {
                            return 1;
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    0
}
