import { Schema, model, models, type InferSchemaType } from "mongoose";

const paymentReminderSchema = new Schema(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    type: {
      type: String,
      enum: ["credit_card", "rent", "loan", "utilities", "subscription", "other"],
      required: true,
      default: "other",
    },
    recurrence: {
      type: String,
      enum: ["monthly", "quarterly", "annually", "one_time"],
      required: true,
      default: "monthly",
    },
    startDate: {
      type: Date,
      default: null,
    },
    termMonths: {
      type: Number,
      min: 1,
      max: 600,
      default: null,
    },
    amountMode: {
      type: String,
      enum: ["fixed", "variable"],
      required: true,
      default: "fixed",
    },
    baseAmountMinor: {
      type: Number,
      default: null,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: "USD",
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 280,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

paymentReminderSchema.index({ householdId: 1, archivedAt: 1, isActive: 1 });

export type PaymentReminderDocument = InferSchemaType<typeof paymentReminderSchema>;

export const PaymentReminder =
  models.PaymentReminder || model("PaymentReminder", paymentReminderSchema);
