import { Schema, model, models, type InferSchemaType } from "mongoose";

const paymentAmountOverrideSchema = new Schema(
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
    amountMinor: {
      type: Number,
      required: true,
      min: 0,
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

paymentAmountOverrideSchema.index(
  { householdId: 1, paymentReminderId: 1, monthKey: 1 },
  { unique: true },
);

export type PaymentAmountOverrideDocument = InferSchemaType<
  typeof paymentAmountOverrideSchema
>;

export const PaymentAmountOverride =
  models.PaymentAmountOverride ||
  model("PaymentAmountOverride", paymentAmountOverrideSchema);
