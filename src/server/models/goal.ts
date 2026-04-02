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
