// @ts-expect-error -- у gateway нет типов; строка покраснеет сама, когда они появятся
import { pay } from "./gateway";

export async function checkout(cart: unknown) {
  // eslint-disable-next-line no-console -- это программа командной строки, вывод и есть интерфейс
  console.log(cart);
  return pay(cart as never);
}
