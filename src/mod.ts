/**
 * Returns the sum of all numbers in `values`.
 */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }

  return total;
}

/**
 * Returns the arithmetic mean of `values`.
 *
 * @throws {Error} When `values` is empty.
 */
export function average(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot compute average of an empty array.");
  }

  return sum(values) / values.length;
}
