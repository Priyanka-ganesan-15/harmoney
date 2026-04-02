import { Schema, model, models, type InferSchemaType } from "mongoose";

const budgetPeriodSchema = new Schema(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      index: true,
    },
    monthKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: "USD",
    },
    status: {
      type: String,
      enum: ["open", "closed"],
      required: true,
      default: "open",
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

budgetPeriodSchema.index({ householdId: 1, monthKey: 1 }, { unique: true });

export type BudgetPeriodDocument = InferSchemaType<typeof budgetPeriodSchema>;

export const BudgetPeriod =
  models.BudgetPeriod || model("BudgetPeriod", budgetPeriodSchema);
