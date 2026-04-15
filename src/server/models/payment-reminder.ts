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
      enum: [
        "credit_card",
        "rent",
        "mortgage",
        "loan",
        "utilities",
        "subscription",
        "insurance",
        "tax",
        "savings_contribution",
        "investment_contribution",
        "other",
      ],
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
    /** Which account the payment is drawn from (e.g. checking). */
    payFromAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },
    /** The credit/loan account this payment settles (for liability payments). */
    liabilityAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },
    /** Normalized payee/merchant name for display and matching. */
    payeeName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    /** Day-of-month the payment is due (1–28). Separate from startDate anchor day. */
    dueDay: {
      type: Number,
      default: null,
      min: 1,
      max: 28,
    },
    /** Budget category this obligation counts against. */
    linkedCategoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
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
