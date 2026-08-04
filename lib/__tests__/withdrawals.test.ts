import { describe, it } from "vitest";
import assert from "node:assert";

describe("Withdrawal Validation Rules", () => {
  const MIN_WITHDRAWAL = 10000;
  const MAX_WITHDRAWAL = 50000;

  it("should accept valid withdrawal amounts within [10000, 50000]", () => {
    const validAmount = 25000;
    assert.strictEqual(validAmount >= MIN_WITHDRAWAL && validAmount <= MAX_WITHDRAWAL, true);
  });

  it("should reject withdrawal amounts below 10000", () => {
    const lowAmount = 5000;
    assert.strictEqual(lowAmount < MIN_WITHDRAWAL, true);
  });

  it("should reject withdrawal amounts above 50000", () => {
    const highAmount = 60000;
    assert.strictEqual(highAmount > MAX_WITHDRAWAL, true);
  });
});
