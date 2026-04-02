import { Schema, model, models, type InferSchemaType } from "mongoose";

const inviteSchema = new Schema(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    invitedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired"],
      required: true,
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type InviteDocument = InferSchemaType<typeof inviteSchema>;

export const Invite = models.Invite || model("Invite", inviteSchema);
