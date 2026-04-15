import { Schema, model, models, type InferSchemaType } from "mongoose";

const goalSchema = new Schema(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    goalType: {
      type: String,
      enum: [
        "emergency_fund",
        "debt_payoff",
        "travel",
        "home_down_payment",
        "car",
        "education",
        "retirement_bridge",
        "family_support",
        "custom",
      ],
      required: true,
      default: "custom",
    },
    status: {
      type: String,
      enum: ["active", "paused", "completed", "canceled"],
      required: true,
      default: "active",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      required: true,
      default: "medium",
    },
    targetAmountMinor: {
      type: Number,
      required: true,
      min: 1,
    },
    currentAmountMinor: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: "USD",
    },
    targetDate: {
      type: Date,
      default: null,
      index: true,
    },
    /** Account where contributions to this goal accumulate. */
    fundingAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },
    /** Budget category linked to this goal for contribution tracking. */
    linkedBudgetCategoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    isArchived: {
      type: Boolean,
      required: true,
      default: false,
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

goalSchema.index({ householdId: 1, isArchived: 1, createdAt: -1 });

export type GoalDocument = InferSchemaType<typeof goalSchema>;

export const Goal = models.Goal || model("Goal", goalSchema);
