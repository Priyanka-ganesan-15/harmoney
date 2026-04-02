import { Schema, model, models, type InferSchemaType } from "mongoose";

const auditEventSchema = new Schema(
  {
    householdId: {
      type: Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      index: true,
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

auditEventSchema.index({ householdId: 1, createdAt: -1 });

export type AuditEventDocument = InferSchemaType<typeof auditEventSchema>;

export const AuditEvent = models.AuditEvent || model("AuditEvent", auditEventSchema);
