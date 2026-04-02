export type AccessScope = "shared" | "restricted";

export type HouseholdRole = "owner" | "partner";

export type AccountKind =
  | "depository"
  | "credit"
  | "investment"
  | "cash"
  | "loan";

export type TransactionEntryType =
  | "opening_balance"
  | "income"
  | "expense"
  | "transfer_in"
  | "transfer_out"
  | "adjustment"
  | "interest"
  | "fee"
  | "payment";

export type SourceType = "manual" | "imported" | "system";
