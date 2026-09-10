import { checkout } from "./checkout.js";

it("считает корзину", async () => {
  expect(await checkout({ items: [1, 2] })).toEqual({ total: 3 });
});
