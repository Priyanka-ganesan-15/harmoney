import { Schema, model, models, type InferSchemaType } from "mongoose";

const budgetLineSchema = new Schema(
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
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    amountMinor: {
      type: Number,
      required: true,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: "USD",
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

budgetLineSchema.index(
  { householdId: 1, monthKey: 1, categoryId: 1 },
  { unique: true },
);

export type BudgetLineDocument = InferSchemaType<typeof budgetLineSchema>;

export const BudgetLine =
  models.BudgetLine || model("BudgetLine", budgetLineSchema);
