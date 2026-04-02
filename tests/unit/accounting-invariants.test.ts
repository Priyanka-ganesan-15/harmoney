import { describe, expect, it } from "vitest";
import {
  assertOpeningBalanceInvariant,
  assertTransactionSignInvariant,
} from "@/lib/accounting-invariants";

describe("accounting invariants", () => {
  it("accepts valid opening balances", () => {
    expect(() => assertOpeningBalanceInvariant("depository", -2000)).not.toThrow();
    expect(() => assertOpeningBalanceInvariant("credit", 2000)).not.toThrow();
  });

  it("rejects invalid liability opening balance sign", () => {
    expect(() => assertOpeningBalanceInvariant("credit", -2000)).toThrow(
      "LIABILITY_OPENING_BALANCE_INVALID",
    );
  });

  it("accepts valid asset transaction signs", () => {
    expect(() => assertTransactionSignInvariant("depository", "expense", -1000)).not.toThrow();
    expect(() => assertTransactionSignInvariant("depository", "income", 1000)).not.toThrow();
  });

  it("accepts valid liability transaction signs", () => {
    expect(() => assertTransactionSignInvariant("credit", "expense", 1000)).not.toThrow();
    expect(() => assertTransactionSignInvariant("credit", "income", -1000)).not.toThrow();
  });

  it("rejects invalid transaction amount values", () => {
    expect(() => assertTransactionSignInvariant("cash", "expense", 0)).toThrow(
      "TRANSACTION_AMOUNT_INVALID",
    );
  });
});
