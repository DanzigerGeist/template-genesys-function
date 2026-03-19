import { average, sum } from "../src/mod.ts";

const numbers = Array.from({ length: 1_000 }, (_, index) => index);

Deno.bench("sum 1k numbers", () => {
  sum(numbers);
});

Deno.bench("average 1k numbers", () => {
  average(numbers);
});
