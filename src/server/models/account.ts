import { Schema, model, models, type InferSchemaType } from "mongoose";

const ACCOUNT_KIND_VALUES = [
  "depository",
  "credit",
  "investment",
  "retirement",
  "cash",
  "loan",
  "precious_metals",
  "real_estate",
  "other",
] as const;

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
      enum: ACCOUNT_KIND_VALUES,
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

const existingAccountModel = models.Account;

if (existingAccountModel) {
  const kindPath = existingAccountModel.schema.path("kind") as
    | ({ enumValues?: string[]; options?: { enum?: string[] } } & Record<string, unknown>)
    | undefined;

  if (kindPath) {
    const currentValues = new Set(kindPath.enumValues ?? []);
    const hasAllKinds = ACCOUNT_KIND_VALUES.every((value) => currentValues.has(value));

    if (!hasAllKinds) {
      kindPath.enumValues = [...ACCOUNT_KIND_VALUES];
      if (kindPath.options) {
        kindPath.options.enum = [...ACCOUNT_KIND_VALUES];
      }
    }
  }
}

export const Account = existingAccountModel || model("Account", accountSchema);
