import { assertEquals, assertThrows } from "@std/assert";
import { average, sum } from "../src/mod.ts";

Deno.test("sum adds all values", () => {
  assertEquals(sum([1, 2, 3, 4]), 10);
});

Deno.test("sum returns 0 for an empty list", () => {
  assertEquals(sum([]), 0);
});

Deno.test("average computes the arithmetic mean", () => {
  assertEquals(average([2, 4, 6, 8]), 5);
});

Deno.test("average throws on an empty list", () => {
  assertThrows(
    () => average([]),
    Error,
    "Cannot compute average of an empty array.",
  );
});
