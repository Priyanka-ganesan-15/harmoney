import { Schema, model, models, type InferSchemaType } from "mongoose";

const recurringExpenseSchema = new Schema(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      required: true,
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
    frequency: {
      type: String,
      enum: ["monthly", "weekly", "biweekly", "quarterly", "annually"],
      required: true,
      default: "monthly",
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
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

recurringExpenseSchema.index(
  { householdId: 1, categoryId: 1 },
  { unique: true },
);

export type RecurringExpenseDocument = InferSchemaType<
  typeof recurringExpenseSchema
>;

export const RecurringExpense =
  models.RecurringExpense ||
  model("RecurringExpense", recurringExpenseSchema);
