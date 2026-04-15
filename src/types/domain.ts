export type AccessScope = "shared" | "restricted";

export type HouseholdRole = "owner" | "partner";

export type AccountKind =
  | "depository"
  | "credit"
  | "investment"
  | "retirement"
  | "cash"
  | "loan"
  | "precious_metals"
  | "real_estate"
  | "other";

/** Whether an account is jointly owned or belongs to one partner. */
export type AccountOwnerType = "joint" | "individual";

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

/** Review lifecycle for ledger entries — drives the uncategorized / needs-attention queue. */
export type ReviewStatus = "pending" | "reviewed" | "ignored";

export type PaymentReminderType =
  | "credit_card"
  | "rent"
  | "loan"
  | "mortgage"
  | "utilities"
  | "subscription"
  | "insurance"
  | "tax"
  | "savings_contribution"
  | "investment_contribution"
  | "other";

export type PaymentInstanceStatus =
  | "upcoming"
  | "due_soon"
  | "scheduled"
  | "paid"
  | "overdue"
  | "skipped"
  | "canceled"
  | "matched";

export type GoalType =
  | "emergency_fund"
  | "debt_payoff"
  | "travel"
  | "home_down_payment"
  | "car"
  | "education"
  | "retirement_bridge"
  | "family_support"
  | "custom";

export type GoalStatus = "active" | "paused" | "completed" | "canceled";

export type GoalPriority = "low" | "medium" | "high";
