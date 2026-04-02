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

export function assertOpeningBalanceInvariant(
  accountKind: AccountKind,
  openingBalanceMinor: number,
) {
  if (!Number.isFinite(openingBalanceMinor)) {
    throw new Error("OPENING_BALANCE_INVALID");
  }

  if (LIABILITY_KINDS.has(accountKind) && openingBalanceMinor < 0) {
    throw new Error("LIABILITY_OPENING_BALANCE_INVALID");
  }
}

export function assertTransactionSignInvariant(
  accountKind: AccountKind,
  type: TransactionType,
  signedAmountMinor: number,
) {
  if (!Number.isFinite(signedAmountMinor) || signedAmountMinor === 0) {
    throw new Error("TRANSACTION_AMOUNT_INVALID");
  }

  const isLiability = LIABILITY_KINDS.has(accountKind);

  if (!isLiability && type === "expense" && signedAmountMinor >= 0) {
    throw new Error("ASSET_EXPENSE_SIGN_INVALID");
  }

  if (!isLiability && type === "income" && signedAmountMinor <= 0) {
    throw new Error("ASSET_INCOME_SIGN_INVALID");
  }

  if (isLiability && type === "expense" && signedAmountMinor <= 0) {
    throw new Error("LIABILITY_EXPENSE_SIGN_INVALID");
  }

  if (isLiability && type === "income" && signedAmountMinor >= 0) {
    throw new Error("LIABILITY_INCOME_SIGN_INVALID");
  }
}
