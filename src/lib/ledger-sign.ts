type AccountKind =
  | "depository"
  | "credit"
  | "investment"
  | "retirement"
  | "cash"
  | "loan"
  | "precious_metals"
  | "real_estate"
  | "other";
type TransactionType = "income" | "expense";

const LIABILITY_KINDS = new Set<AccountKind>(["credit", "loan"]);

export function isLiabilityKind(accountKind: AccountKind) {
  return LIABILITY_KINDS.has(accountKind);
}

export function normalizeOpeningBalanceMinorByAccountKind(
  accountKind: AccountKind,
  openingBalanceMinor: number,
) {
  if (isLiabilityKind(accountKind)) {
    // Liability opening balances are tracked as owed amount.
    return Math.abs(openingBalanceMinor);
  }

  return openingBalanceMinor;
}

export function toSignedAmountMinorByAccountKind(
  accountKind: AccountKind,
  type: TransactionType,
  amountMinor: number,
) {
  const absoluteMinor = Math.abs(amountMinor);
  const isLiability = isLiabilityKind(accountKind);

  if (!isLiability) {
    return type === "expense" ? -absoluteMinor : absoluteMinor;
  }

  // For liabilities, expenses increase owed balance and income/payments reduce it.
  return type === "expense" ? absoluteMinor : -absoluteMinor;
}
