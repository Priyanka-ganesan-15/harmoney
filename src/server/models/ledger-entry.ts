import { Schema, model, models, type InferSchemaType } from "mongoose";

const ledgerEntrySchema = new Schema(
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
    transactionGroupId: {
      type: Schema.Types.ObjectId,
      ref: "TransactionGroup",
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    entryType: {
      type: String,
      enum: [
        "opening_balance",
        "income",
        "expense",
        "transfer_in",
        "transfer_out",
        "adjustment",
        "interest",
        "fee",
        "payment",
      ],
      required: true,
    },
    amountMinor: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      index: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accessScope: {
      type: String,
      enum: ["shared", "restricted"],
      required: true,
      default: "shared",
    },
    visibleToMemberIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
    sourceType: {
      type: String,
      enum: ["manual", "imported", "system"],
      required: true,
      default: "manual",
    },
    /**
     * Review lifecycle — drives the uncategorized / needs-attention queue.
     * New entries default to "pending" until the user confirms or ignores them.
     */
    reviewStatus: {
      type: String,
      enum: ["pending", "reviewed", "ignored"],
      required: true,
      default: "pending",
      index: true,
    },
    /** Normalized merchant or payee name (e.g. from import or user edit). */
    merchantName: {
      type: String,
      default: null,
      trim: true,
    },
    /** Links this entry to the payment instance it settled, enabling match tracking. */
    linkedPaymentInstanceId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentInstance",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

ledgerEntrySchema.index({ householdId: 1, accountId: 1, occurredAt: -1 });
ledgerEntrySchema.index({ householdId: 1, reviewStatus: 1, occurredAt: -1 });

export type LedgerEntryDocument = InferSchemaType<typeof ledgerEntrySchema>;

const existingLedgerEntryModel = models.LedgerEntry;

if (existingLedgerEntryModel && !existingLedgerEntryModel.schema.path("categoryId")) {
  existingLedgerEntryModel.schema.add({
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
  });
}

if (existingLedgerEntryModel && !existingLedgerEntryModel.schema.path("reviewStatus")) {
  existingLedgerEntryModel.schema.add({
    reviewStatus: {
      type: String,
      enum: ["pending", "reviewed", "ignored"],
      required: true,
      default: "pending",
    },
    merchantName: { type: String, default: null, trim: true },
    linkedPaymentInstanceId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentInstance",
      default: null,
    },
  });
}

export const LedgerEntry =
  existingLedgerEntryModel || model("LedgerEntry", ledgerEntrySchema);
