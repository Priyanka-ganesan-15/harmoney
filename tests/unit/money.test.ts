import { describe, expect, it } from "vitest";
import { addMoney, formatMoney, toMinorUnits } from "@/lib/money";

describe("money helpers", () => {
  it("adds monetary values without float drift", () => {
    expect(addMoney("10.10", "0.20", "5.55").toString()).toBe("15.85");
  });

  it("converts to minor units for persisted calculations", () => {
    expect(toMinorUnits("42.19", "USD")).toBe(4219);
  });

  it("formats values as localized currency", () => {
    expect(formatMoney("1234.5", "USD", "en-US")).toBe("$1,234.50");
  });
});
