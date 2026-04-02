import { Schema, model, models, type InferSchemaType } from "mongoose";

const accountSchema = new Schema(
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
    },
    institutionName: {
      type: String,
      default: "",
      trim: true,
    },
    kind: {
      type: String,
      enum: [
        "depository",
        "credit",
        "investment",
        "retirement",
        "cash",
        "loan",
        "precious_metals",
        "real_estate",
        "other",
      ],
      required: true,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: "USD",
    },
    openingBalanceMinor: {
      type: Number,
      required: true,
      default: 0,
    },
    minimumPaymentMinor: {
      type: Number,
      default: null,
      min: 0,
    },
    paymentDueDay: {
      type: Number,
      default: null,
      min: 1,
      max: 28,
    },
    aprPercent: {
      type: Number,
      default: null,
      min: 0,
    },
    accessScope: {
      type: String,
      enum: ["shared", "restricted"],
      required: true,
      default: "shared",
    },
    visibleToMemberIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

accountSchema.index({ householdId: 1, archivedAt: 1 });

export type AccountDocument = InferSchemaType<typeof accountSchema>;

export const Account = models.Account || model("Account", accountSchema);
