import logging

log = logging.getLogger(__name__)


def load(p):
    try:
        return open(p).read()
    except OSError:
        log.exception("не удалось прочитать %s", p)
        raise
