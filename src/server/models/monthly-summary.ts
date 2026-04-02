import { Schema, model, models, type InferSchemaType } from "mongoose";

const monthlySummarySchema = new Schema(
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
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: "USD",
    },
    totals: {
      budgetedMinor: { type: Number, required: true, default: 0 },
      actualMinor: { type: Number, required: true, default: 0 },
      remainingMinor: { type: Number, required: true, default: 0 },
    },
    lines: {
      type: [
        {
          categoryId: {
            type: Schema.Types.ObjectId,
            ref: "Category",
            required: true,
          },
          categoryName: { type: String, required: true },
          budgetedMinor: { type: Number, required: true, default: 0 },
          actualMinor: { type: Number, required: true, default: 0 },
          remainingMinor: { type: Number, required: true, default: 0 },
        },
      ],
      default: [],
    },
    finalizedAt: {
      type: Date,
      required: true,
      index: true,
    },
    finalizedByUserId: {
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

monthlySummarySchema.index({ householdId: 1, monthKey: 1 }, { unique: true });

export type MonthlySummaryDocument = InferSchemaType<typeof monthlySummarySchema>;

export const MonthlySummary =
  models.MonthlySummary || model("MonthlySummary", monthlySummarySchema);
