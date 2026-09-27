package svc

func Send(to string) error {
	// TODO: переписать на очередь
	return deliver(to)
}
