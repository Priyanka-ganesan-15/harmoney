import { Schema, model, models, type InferSchemaType } from "mongoose";

const paymentInstanceSchema = new Schema(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      index: true,
    },
    paymentReminderId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentReminder",
      required: true,
      index: true,
    },
    monthKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
      index: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    amountMinor: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: "USD",
    },
    status: {
      type: String,
      enum: ["upcoming", "paid", "skipped"],
      required: true,
      default: "upcoming",
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    paidAmountMinor: {
      type: Number,
      default: null,
      min: 0,
    },
    linkedLedgerEntryId: {
      type: Schema.Types.ObjectId,
      ref: "LedgerEntry",
      default: null,
      index: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

paymentInstanceSchema.index(
  { householdId: 1, paymentReminderId: 1, monthKey: 1 },
  { unique: true },
);

export type PaymentInstanceDocument = InferSchemaType<typeof paymentInstanceSchema>;

export const PaymentInstance =
  models.PaymentInstance || model("PaymentInstance", paymentInstanceSchema);
