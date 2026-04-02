import { Schema, model, models, type InferSchemaType } from "mongoose";

const householdMembershipSchema = new Schema(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["owner", "partner"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active"],
      required: true,
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

householdMembershipSchema.index({ householdId: 1, userId: 1 }, { unique: true });

export type HouseholdMembershipDocument = InferSchemaType<
  typeof householdMembershipSchema
>;

export const HouseholdMembership =
  models.HouseholdMembership ||
  model("HouseholdMembership", householdMembershipSchema);
