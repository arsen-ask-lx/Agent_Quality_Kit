// Печать внутри комментария — не печать. Пример в документации к функции и закомментированная
// строка отладки одинаково не выполняются: находка здесь означает, что проверка читает текст,
// а не код. Найдено прогоном по audit_project — семь находок из JSDoc и закомментированных строк.

/**
 * Скачивает файл.
 *
 * @example
 *   const result = await download(id);
 *   console.log('Done:', result.file_url);
 */
export async function download(id: string): Promise<string> {
  // console.log('отладка', id);
  return `/files/${id}`;
}
