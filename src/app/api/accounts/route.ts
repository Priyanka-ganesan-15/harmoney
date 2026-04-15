import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertOpeningBalanceInvariant } from "@/lib/accounting-invariants";
import { normalizeOpeningBalanceMinorByAccountKind } from "@/lib/ledger-sign";
import { toMinorUnits } from "@/lib/money";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { AccountBalanceSnapshot } from "@/server/models/account-balance-snapshot";
import { AuditEvent } from "@/server/models/audit-event";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { TransactionGroup } from "@/server/models/transaction-group";

const createAccountSchema = z.object({
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
  minimumPayment: z.union([z.string(), z.number()]).optional(),
  paymentDueDay: z.number().int().min(1).max(28).optional(),
  aprPercent: z.number().min(0).optional(),
  accessScope: z.enum(["shared", "restricted"]).default("shared"),
});

export async function GET() {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);

    const accounts = await Account.find({
      householdId: context.householdId,
      archivedAt: null,
      ...visibilityQuery,
    })
      .sort({ createdAt: -1 })
      .lean();

    const accountIds = accounts.map((account) => account._id);

    if (accountIds.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    const balances = await LedgerEntry.aggregate<{
      _id: string;
      balanceMinor: number;
    }>([
      {
        $match: {
          householdId: new Types.ObjectId(context.householdId),
          accountId: { $in: accountIds },
          ...visibilityQuery,
        },
      },
      {
        $group: {
          _id: "$accountId",
          balanceMinor: { $sum: "$amountMinor" },
        },
      },
    ]);

    const balanceMap = new Map(
      balances.map((entry) => [entry._id.toString(), entry.balanceMinor]),
    );

    return NextResponse.json({
      accounts: accounts.map((account) => ({
        id: account._id.toString(),
        name: account.name,
        institutionName: account.institutionName,
        kind: account.kind,
        currency: account.currency,
        accessScope: account.accessScope,
        openingBalanceMinor: account.openingBalanceMinor,
        minimumPaymentMinor: account.minimumPaymentMinor ?? null,
        paymentDueDay: account.paymentDueDay ?? null,
        aprPercent: account.aprPercent ?? null,
        currentBalanceMinor: balanceMap.get(account._id.toString()) ?? 0,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to list accounts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const parsed = createAccountSchema.parse(await request.json());

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
    const minimumPaymentMinor =
      isDebtAccount && parsed.minimumPayment !== undefined
        ? toMinorUnits(Number(parsed.minimumPayment), parsed.currency)
        : null;
    const paymentDueDay = isDebtAccount ? parsed.paymentDueDay ?? null : null;
    const aprPercent = isDebtAccount ? parsed.aprPercent ?? null : null;

    const account = await Account.create({
      householdId: context.householdId,
      name: parsed.name.trim(),
      institutionName: parsed.institutionName.trim(),
      kind: parsed.kind,
      currency: parsed.currency,
      openingBalanceMinor,
      minimumPaymentMinor,
      paymentDueDay,
      aprPercent,
      accessScope: parsed.accessScope,
      visibleToMemberIds:
        parsed.accessScope === "restricted" ? [context.userId] : [],
      createdByUserId: context.userId,
    });

    const group = await TransactionGroup.create({
      householdId: context.householdId,
      type: "opening_balance",
      createdByUserId: context.userId,
      notes: "Opening balance",
    });

    await LedgerEntry.create({
      householdId: context.householdId,
      accountId: account._id,
      transactionGroupId: group._id,
      entryType: "opening_balance",
      amountMinor: openingBalanceMinor,
      currency: parsed.currency,
      description: "Opening balance",
      occurredAt: new Date(),
      createdByUserId: context.userId,
      accessScope: parsed.accessScope,
      visibleToMemberIds: parsed.accessScope === "restricted" ? [context.userId] : [],
      sourceType: "manual",
    });

    // Capture baseline historical point-in-time balance at account creation.
    await AccountBalanceSnapshot.create({
      householdId: context.householdId,
      accountId: account._id,
      snapshotDate: new Date(),
      balanceMinor: openingBalanceMinor,
      currency: parsed.currency,
      source: "manual",
    });

    await AuditEvent.create({
      householdId: context.householdId,
      actorUserId: context.userId,
      entityType: "account",
      entityId: account._id,
      action: "account.created",
      metadata: {
        kind: parsed.kind,
        currency: parsed.currency,
        openingBalanceMinor,
      },
    });

    return NextResponse.json({ success: true, accountId: account._id.toString() });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
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

    return NextResponse.json({ message: "Unable to create account." }, { status: 500 });
  }
}
