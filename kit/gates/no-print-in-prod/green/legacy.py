# print("это когда-то было отладкой") — строка закомментирована и не выполняется
import logging

log = logging.getLogger(__name__)


def handle(x):
    log.debug("got %s", x)
    return x + 1
