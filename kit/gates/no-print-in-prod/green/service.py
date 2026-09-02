import logging

log = logging.getLogger(__name__)


def handle(x):
    log.debug("got %s", x)
    return x + 1
