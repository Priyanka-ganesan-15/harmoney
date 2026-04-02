import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { AuditEvent } from "@/server/models/audit-event";

const updateAccountSchema = z.object({
  name: z.string().min(2).max(80),
  institutionName: z.string().max(120).optional().default(""),
  accessScope: z.enum(["shared", "restricted"]),
});

type Params = {
  params: Promise<{ accountId: string }>;
};

function handleAuthError(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return null;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const { accountId } = await params;

    if (!Types.ObjectId.isValid(accountId)) {
      return NextResponse.json({ message: "Invalid account id." }, { status: 400 });
    }

    const parsed = updateAccountSchema.parse(await request.json());

    const account = await Account.findOne({
      _id: accountId,
      householdId: context.householdId,
      archivedAt: null,
      ...visibilityQuery,
    });

    if (!account) {
      return NextResponse.json({ message: "Account not found." }, { status: 404 });
    }

    const oldAccessScope = account.accessScope;

    account.name = parsed.name.trim();
    account.institutionName = parsed.institutionName.trim();
    account.accessScope = parsed.accessScope;
    account.visibleToMemberIds = parsed.accessScope === "restricted" ? [context.userId] : [];

    await account.save();

    await AuditEvent.create({
      householdId: context.householdId,
      actorUserId: context.userId,
      entityType: "account",
      entityId: account._id,
      action: "account.updated",
      metadata: {
        previousAccessScope: oldAccessScope,
        accessScope: parsed.accessScope,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authError = handleAuthError(error);

    if (authError) {
      return authError;
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid account payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: "Unable to update account." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const { accountId } = await params;

    if (!Types.ObjectId.isValid(accountId)) {
      return NextResponse.json({ message: "Invalid account id." }, { status: 400 });
    }

    const account = await Account.findOne({
      _id: accountId,
      householdId: context.householdId,
      archivedAt: null,
      ...visibilityQuery,
    });

    if (!account) {
      return NextResponse.json({ message: "Account not found." }, { status: 404 });
    }

    account.archivedAt = new Date();
    await account.save();

    await AuditEvent.create({
      householdId: context.householdId,
      actorUserId: context.userId,
      entityType: "account",
      entityId: account._id,
      action: "account.archived",
      metadata: {
        kind: account.kind,
        currency: account.currency,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authError = handleAuthError(error);

    if (authError) {
      return authError;
    }

    return NextResponse.json({ message: "Unable to archive account." }, { status: 500 });
  }
}
