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
  },
  {
    timestamps: true,
  },
);

ledgerEntrySchema.index({ householdId: 1, accountId: 1, occurredAt: -1 });

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

export const LedgerEntry =
  existingLedgerEntryModel || model("LedgerEntry", ledgerEntrySchema);
