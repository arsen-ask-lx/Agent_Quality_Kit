def load(p):
    try:
        return open(p).read()
    except Exception:
        pass
