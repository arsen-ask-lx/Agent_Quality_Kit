import { checkout } from "./checkout";

it("считает корзину", async () => {
  expect(await checkout({ items: [1, 2] })).toEqual({ total: 3 });
});

it("не падает на пустой корзине", async () => {
  await checkout({ items: [] });
});
