import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * Stores point-in-time balance readings for an account.
 *
 * These snapshots are the source of truth for historical net-worth charts
 * and trend views. Querying historical periods should use snapshots, never
 * the live `openingBalanceMinor` field on Account.
 *
 * Insertion rules:
 *  - One snapshot per account per day is idiomatic; duplicates within a day
 *    are allowed (latest wins for that date when building charts).
 *  - Automated snapshots (source = "system") are created by background jobs.
 *  - Manual snapshots (source = "manual") are created by user reconciliation.
 *  - Imported snapshots (source = "imported") come from bank feeds or CSV import.
 */
const accountBalanceSnapshotSchema = new Schema(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    /**
     * The calendar date this balance was observed.
     * Stored as UTC midnight so date-range queries are predictable.
     */
    snapshotDate: {
      type: Date,
      required: true,
      index: true,
    },
    /**
     * Balance in minor currency units (e.g. cents for USD).
     * For liability accounts (credit/loan) this is the positive amount owed.
     */
    balanceMinor: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: "USD",
    },
    source: {
      type: String,
      enum: ["manual", "imported", "system"],
      required: true,
      default: "manual",
    },
  },
  {
    timestamps: true,
  },
);

// Fast lookup: latest snapshot per account in date range.
accountBalanceSnapshotSchema.index({ accountId: 1, snapshotDate: -1 });
// Household-level trend queries.
accountBalanceSnapshotSchema.index({ householdId: 1, snapshotDate: -1 });

export type AccountBalanceSnapshotDocument = InferSchemaType<
  typeof accountBalanceSnapshotSchema
>;

export const AccountBalanceSnapshot =
  models.AccountBalanceSnapshot ||
  model("AccountBalanceSnapshot", accountBalanceSnapshotSchema);
