pub fn send(to: &str) -> bool {
    // FIXME: переписать на очередь
    deliver(to)
}
