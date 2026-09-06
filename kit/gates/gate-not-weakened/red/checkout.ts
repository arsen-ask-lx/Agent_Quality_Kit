/* eslint-disable */
// @ts-ignore
import { pay } from "./gateway";

export async function checkout(cart: unknown) {
  // eslint-disable-next-line
  console.log(cart);
  return pay(cart as never);
}
