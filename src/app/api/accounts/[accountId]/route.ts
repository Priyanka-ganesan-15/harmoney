import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertOpeningBalanceInvariant } from "@/lib/accounting-invariants";
import { normalizeOpeningBalanceMinorByAccountKind } from "@/lib/ledger-sign";
import { toMinorUnits } from "@/lib/money";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { AuditEvent } from "@/server/models/audit-event";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { TransactionGroup } from "@/server/models/transaction-group";

const updateAccountSchema = z.object({
  name: z.string().min(2).max(80),
  institutionName: z.string().max(120).optional().default(""),
  kind: z.enum([
    "depository",
    "credit",
    "investment",
    "retirement",
    "cash",
    "loan",
    "precious_metals",
    "real_estate",
    "other",
  ]),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  openingBalance: z.union([z.string(), z.number()]),
  accessScope: z.enum(["shared", "restricted"]),
  minimumPayment: z.union([z.string(), z.number()]).optional(),
  paymentDueDay: z.number().int().min(1).max(28).nullable().optional(),
  aprPercent: z.number().min(0).nullable().optional(),
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

    const oldName = account.name;
    const oldInstitutionName = account.institutionName;
    const oldKind = account.kind;
    const oldCurrency = account.currency;
    const oldOpeningBalanceMinor = account.openingBalanceMinor;
    const oldAccessScope = account.accessScope;
    const oldMinimumPaymentMinor = account.minimumPaymentMinor ?? null;
    const oldPaymentDueDay = account.paymentDueDay ?? null;
    const oldAprPercent = account.aprPercent ?? null;

    const openingBalanceRawMinor = toMinorUnits(
      Number(parsed.openingBalance || 0),
      parsed.currency,
    );
    const openingBalanceMinor = normalizeOpeningBalanceMinorByAccountKind(
      parsed.kind,
      openingBalanceRawMinor,
    );

    assertOpeningBalanceInvariant(parsed.kind, openingBalanceMinor);

    const isDebtAccount = parsed.kind === "credit" || parsed.kind === "loan";

    account.kind = parsed.kind;
    account.currency = parsed.currency;
    account.openingBalanceMinor = openingBalanceMinor;

    account.name = parsed.name.trim();
    account.institutionName = parsed.institutionName.trim();
    account.accessScope = parsed.accessScope;
    account.visibleToMemberIds = parsed.accessScope === "restricted" ? [context.userId] : [];

    if (isDebtAccount) {
      account.minimumPaymentMinor =
        parsed.minimumPayment !== undefined
          ? toMinorUnits(Number(parsed.minimumPayment), account.currency)
          : null;
      account.paymentDueDay = parsed.paymentDueDay ?? null;
      account.aprPercent = parsed.aprPercent ?? null;
    } else {
      account.minimumPaymentMinor = null;
      account.paymentDueDay = null;
      account.aprPercent = null;
    }

    if (oldCurrency !== parsed.currency) {
      await LedgerEntry.updateMany(
        {
          householdId: context.householdId,
          accountId: account._id,
        },
        {
          $set: { currency: parsed.currency },
        },
      );
    }

    const openingBalanceDeltaMinor = openingBalanceMinor - oldOpeningBalanceMinor;
    if (openingBalanceDeltaMinor !== 0) {
      const group = await TransactionGroup.create({
        householdId: context.householdId,
        type: "manual",
        createdByUserId: context.userId,
        notes: "Opening balance adjustment",
      });

      await LedgerEntry.create({
        householdId: context.householdId,
        accountId: account._id,
        transactionGroupId: group._id,
        entryType: "adjustment",
        amountMinor: openingBalanceDeltaMinor,
        currency: parsed.currency,
        description: "Opening balance adjustment",
        occurredAt: new Date(),
        createdByUserId: context.userId,
        accessScope: parsed.accessScope,
        visibleToMemberIds: parsed.accessScope === "restricted" ? [context.userId] : [],
        sourceType: "system",
      });
    }

    await account.save();

    await AuditEvent.create({
      householdId: context.householdId,
      actorUserId: context.userId,
      entityType: "account",
      entityId: account._id,
      action: "account.updated",
      metadata: {
        previousName: oldName,
        name: account.name,
        previousInstitutionName: oldInstitutionName,
        institutionName: account.institutionName,
        previousKind: oldKind,
        kind: account.kind,
        previousCurrency: oldCurrency,
        currency: account.currency,
        previousOpeningBalanceMinor: oldOpeningBalanceMinor,
        openingBalanceMinor: account.openingBalanceMinor,
        previousAccessScope: oldAccessScope,
        accessScope: parsed.accessScope,
        previousMinimumPaymentMinor: oldMinimumPaymentMinor,
        minimumPaymentMinor: account.minimumPaymentMinor ?? null,
        previousPaymentDueDay: oldPaymentDueDay,
        paymentDueDay: account.paymentDueDay ?? null,
        previousAprPercent: oldAprPercent,
        aprPercent: account.aprPercent ?? null,
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

    if (
      error instanceof Error &&
      (error.message === "OPENING_BALANCE_INVALID" ||
        error.message === "LIABILITY_OPENING_BALANCE_INVALID")
    ) {
      return NextResponse.json(
        { message: "Invalid opening balance for this account type." },
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
