import { Schema, model, models, type InferSchemaType } from "mongoose";

const categorySchema = new Schema(
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
    kind: {
      type: String,
      enum: ["expense", "income"],
      required: true,
      default: "expense",
    },
    parentCategoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    isSystem: {
      type: Boolean,
      default: false,
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

categorySchema.index({ householdId: 1, kind: 1, archivedAt: 1 });
categorySchema.index({ householdId: 1, name: 1, kind: 1 }, { unique: true });

export type CategoryDocument = InferSchemaType<typeof categorySchema>;

export const Category = models.Category || model("Category", categorySchema);
