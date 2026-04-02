import { Schema, model, models, type InferSchemaType } from "mongoose";

const householdSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    baseCurrency: {
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

export type HouseholdDocument = InferSchemaType<typeof householdSchema>;

export const Household = models.Household || model("Household", householdSchema);
