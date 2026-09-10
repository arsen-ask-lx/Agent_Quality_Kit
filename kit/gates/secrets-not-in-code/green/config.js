// Ключ приходит из окружения. В коде остаётся только его ИМЯ — это не секрет.
export const STRIPE_KEY = process.env.STRIPE_KEY;

if (!STRIPE_KEY) throw new Error("STRIPE_KEY не задан: см. .env.example");
