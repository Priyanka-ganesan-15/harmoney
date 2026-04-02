import { describe, expect, it } from "vitest";
import {
  isLiabilityKind,
  normalizeOpeningBalanceMinorByAccountKind,
  toSignedAmountMinorByAccountKind,
} from "@/lib/ledger-sign";

describe("ledger sign by account kind", () => {
  it("treats depository expense as negative and income as positive", () => {
    expect(toSignedAmountMinorByAccountKind("depository", "expense", 2500)).toBe(-2500);
    expect(toSignedAmountMinorByAccountKind("depository", "income", 2500)).toBe(2500);
  });

  it("treats credit expense as positive owed balance", () => {
    expect(toSignedAmountMinorByAccountKind("credit", "expense", 2500)).toBe(2500);
  });

  it("treats credit income as payment reducing owed balance", () => {
    expect(toSignedAmountMinorByAccountKind("credit", "income", 2500)).toBe(-2500);
  });

  it("treats loan income as payment reducing liability", () => {
    expect(toSignedAmountMinorByAccountKind("loan", "income", 1200)).toBe(-1200);
  });

  it("normalizes liability opening balances to owed positive values", () => {
    expect(normalizeOpeningBalanceMinorByAccountKind("credit", -5000)).toBe(5000);
    expect(normalizeOpeningBalanceMinorByAccountKind("loan", -12000)).toBe(12000);
  });

  it("keeps asset opening balances unchanged", () => {
    expect(normalizeOpeningBalanceMinorByAccountKind("depository", -5000)).toBe(-5000);
    expect(normalizeOpeningBalanceMinorByAccountKind("cash", 5000)).toBe(5000);
  });

  it("marks liability account kinds correctly", () => {
    expect(isLiabilityKind("credit")).toBe(true);
    expect(isLiabilityKind("loan")).toBe(true);
    expect(isLiabilityKind("depository")).toBe(false);
    expect(isLiabilityKind("cash")).toBe(false);
    expect(isLiabilityKind("investment")).toBe(false);
  });

  it("applies asset account sign rules consistently", () => {
    expect(toSignedAmountMinorByAccountKind("cash", "expense", 500)).toBe(-500);
    expect(toSignedAmountMinorByAccountKind("cash", "income", 500)).toBe(500);
    expect(toSignedAmountMinorByAccountKind("investment", "expense", 500)).toBe(-500);
    expect(toSignedAmountMinorByAccountKind("investment", "income", 500)).toBe(500);
  });

  it("applies liability account sign rules consistently", () => {
    expect(toSignedAmountMinorByAccountKind("credit", "expense", 500)).toBe(500);
    expect(toSignedAmountMinorByAccountKind("credit", "income", 500)).toBe(-500);
    expect(toSignedAmountMinorByAccountKind("loan", "expense", 500)).toBe(500);
    expect(toSignedAmountMinorByAccountKind("loan", "income", 500)).toBe(-500);
  });
});
