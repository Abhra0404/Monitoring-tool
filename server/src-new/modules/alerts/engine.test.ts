import { describe, it, expect } from "vitest";
import { evaluateCondition } from "./engine.js";

describe("evaluateCondition", () => {
  it("> true when value exceeds threshold", () => {
    expect(evaluateCondition(91, ">", 90)).toBe(true);
  });
  it("> false when value equals threshold", () => {
    expect(evaluateCondition(90, ">", 90)).toBe(false);
  });
  it("< true when value below threshold", () => {
    expect(evaluateCondition(5, "<", 10)).toBe(true);
  });
  it(">= includes equal", () => {
    expect(evaluateCondition(90, ">=", 90)).toBe(true);
  });
  it("<= includes equal", () => {
    expect(evaluateCondition(90, "<=", 90)).toBe(true);
  });
  it("== exact match", () => {
    expect(evaluateCondition(42, "==", 42)).toBe(true);
    expect(evaluateCondition(42, "==", 43)).toBe(false);
  });
  it("unknown operator returns false", () => {
    expect(evaluateCondition(50, "!=", 50)).toBe(false);
  });
});
