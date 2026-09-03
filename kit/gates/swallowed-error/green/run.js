async function go() {
  try {
    await run();
  } catch (e) {
    logger.error("шаг не выполнен", e);
    throw e;
  }
}
