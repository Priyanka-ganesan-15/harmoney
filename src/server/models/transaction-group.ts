import { Schema, model, models, type InferSchemaType } from "mongoose";

const transactionGroupSchema = new Schema(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["manual", "opening_balance", "transfer"],
      required: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

export type TransactionGroupDocument = InferSchemaType<
  typeof transactionGroupSchema
>;

export const TransactionGroup =
  models.TransactionGroup || model("TransactionGroup", transactionGroupSchema);
