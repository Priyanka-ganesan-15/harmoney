import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTransactionSignInvariant } from "@/lib/accounting-invariants";
import { toSignedAmountMinorByAccountKind } from "@/lib/ledger-sign";
import { toMinorUnits } from "@/lib/money";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { AuditEvent } from "@/server/models/audit-event";
import { Category } from "@/server/models/category";
import { BudgetPeriod } from "@/server/models/budget-period";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { TransactionGroup } from "@/server/models/transaction-group";

const createLedgerEntrySchema = z.object({
  accountId: z.string().min(1).optional(),
  toAccountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.union([z.string(), z.number()]),
  description: z.string().max(200).optional().default(""),
  occurredAt: z.string().datetime().optional(),
});

function toMonthKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function GET() {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);

    const activeAccounts = await Account.find({
      householdId: context.householdId,
      archivedAt: null,
      ...visibilityQuery,
    })
      .select({ _id: 1 })
      .lean();

    const activeAccountIds = activeAccounts.map((account) => account._id);

    if (activeAccountIds.length === 0) {
      return NextResponse.json({ entries: [] });
    }

    const entries = await LedgerEntry.find({
      householdId: context.householdId,
      accountId: { $in: activeAccountIds },
      ...visibilityQuery,
    })
      .sort({ occurredAt: -1, createdAt: -1 })
      .limit(30)
      .lean();

    return NextResponse.json({
      entries: entries.map((entry) => ({
        id: entry._id.toString(),
        accountId: entry.accountId.toString(),
        categoryId: entry.categoryId?.toString() ?? null,
        transactionGroupId: entry.transactionGroupId.toString(),
        entryType: entry.entryType,
        amountMinor: entry.amountMinor,
        currency: entry.currency,
        description: entry.description,
        occurredAt: entry.occurredAt,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load transactions." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const parsed = createLedgerEntrySchema.parse(await request.json());
    const occurredAt = parsed.occurredAt ? new Date(parsed.occurredAt) : new Date();
    const monthKey = toMonthKey(occurredAt);

    const period = await BudgetPeriod.findOne({
      householdId: context.householdId,
      monthKey,
    })
      .select({ status: 1 })
      .lean();

    if (period?.status === "closed") {
      return NextResponse.json(
        { message: "This period is closed. Reopen it to edit transactions." },
        { status: 409 },
      );
    }

    if (parsed.type !== "transfer" && !parsed.accountId) {
      return NextResponse.json({ message: "Account is required." }, { status: 400 });
    }

    if (parsed.type !== "transfer") {
      if (!parsed.accountId || !Types.ObjectId.isValid(parsed.accountId)) {
        return NextResponse.json({ message: "Invalid account id." }, { status: 400 });
      }

      const account = await Account.findOne({
        _id: parsed.accountId,
        householdId: context.householdId,
        archivedAt: null,
        ...visibilityQuery,
      }).lean();

      if (!account) {
        return NextResponse.json({ message: "Account not found." }, { status: 404 });
      }

      const normalized = toMinorUnits(Number(parsed.amount), account.currency);
      const signedAmount = toSignedAmountMinorByAccountKind(
        account.kind,
        parsed.type,
        normalized,
      );

      assertTransactionSignInvariant(account.kind, parsed.type, signedAmount);

      let categoryObjectId: Types.ObjectId | null = null;

      if (parsed.categoryId) {
        if (!Types.ObjectId.isValid(parsed.categoryId)) {
          return NextResponse.json({ message: "Invalid category id." }, { status: 400 });
        }

        const category = await Category.findOne({
          _id: parsed.categoryId,
          householdId: context.householdId,
          archivedAt: null,
        }).lean();

        if (!category) {
          return NextResponse.json({ message: "Category not found." }, { status: 404 });
        }

        if (category.kind !== parsed.type) {
          return NextResponse.json(
            { message: "Category kind must match transaction type." },
            { status: 400 },
          );
        }

        categoryObjectId = new Types.ObjectId(parsed.categoryId);
      }

      const group = await TransactionGroup.create({
        householdId: context.householdId,
        type: "manual",
        createdByUserId: context.userId,
        notes: parsed.description,
      });

      const entry = await LedgerEntry.create({
        householdId: context.householdId,
        accountId: account._id,
        categoryId: categoryObjectId,
        transactionGroupId: group._id,
        entryType: parsed.type,
        amountMinor: signedAmount,
        currency: account.currency,
        description: parsed.description,
        occurredAt,
        createdByUserId: context.userId,
        accessScope: account.accessScope,
        visibleToMemberIds:
          account.accessScope === "restricted" ? [context.userId] : [],
        sourceType: "manual",
      });

      await AuditEvent.create({
        householdId: context.householdId,
        actorUserId: context.userId,
        entityType: "ledger_entry",
        entityId: entry._id,
        action: "ledger_entry.created",
        metadata: {
          accountId: account._id.toString(),
          categoryId: categoryObjectId?.toString() ?? null,
          entryType: parsed.type,
          amountMinor: signedAmount,
        },
      });

      return NextResponse.json({ success: true, entryId: entry._id.toString() });
    }

    if (
      !parsed.accountId ||
      !parsed.toAccountId ||
      !Types.ObjectId.isValid(parsed.accountId) ||
      !Types.ObjectId.isValid(parsed.toAccountId)
    ) {
      return NextResponse.json(
        { message: "Valid source and destination accounts are required." },
        { status: 400 },
      );
    }

    if (parsed.accountId === parsed.toAccountId) {
      return NextResponse.json(
        { message: "Source and destination accounts must be different." },
        { status: 400 },
      );
    }

    const [fromAccount, toAccount] = await Promise.all([
      Account.findOne({
        _id: parsed.accountId,
        householdId: context.householdId,
        archivedAt: null,
        ...visibilityQuery,
      }).lean(),
      Account.findOne({
        _id: parsed.toAccountId,
        householdId: context.householdId,
        archivedAt: null,
        ...visibilityQuery,
      }).lean(),
    ]);

    if (!fromAccount || !toAccount) {
      return NextResponse.json(
        { message: "One or more transfer accounts were not found." },
        { status: 404 },
      );
    }

    if (fromAccount.currency !== toAccount.currency) {
      return NextResponse.json(
        { message: "Cross-currency transfers are not supported yet." },
        { status: 400 },
      );
    }

    const amountMinor = Math.abs(
      toMinorUnits(Number(parsed.amount), fromAccount.currency),
    );

    if (amountMinor <= 0) {
      return NextResponse.json(
        { message: "Transfer amount must be greater than zero." },
        { status: 400 },
      );
    }

    const notes = parsed.description.trim() || "Transfer";

    const group = await TransactionGroup.create({
      householdId: context.householdId,
      type: "transfer",
      createdByUserId: context.userId,
      notes,
    });

    const [fromEntry, toEntry] = await LedgerEntry.create([
      {
        householdId: context.householdId,
        accountId: fromAccount._id,
        transactionGroupId: group._id,
        entryType: "transfer_out",
        amountMinor: -amountMinor,
        currency: fromAccount.currency,
        description: notes,
        occurredAt,
        createdByUserId: context.userId,
        accessScope: fromAccount.accessScope,
        visibleToMemberIds:
          fromAccount.accessScope === "restricted" ? [context.userId] : [],
        sourceType: "manual",
      },
      {
        householdId: context.householdId,
        accountId: toAccount._id,
        transactionGroupId: group._id,
        entryType: "transfer_in",
        amountMinor,
        currency: toAccount.currency,
        description: notes,
        occurredAt,
        createdByUserId: context.userId,
        accessScope: toAccount.accessScope,
        visibleToMemberIds:
          toAccount.accessScope === "restricted" ? [context.userId] : [],
        sourceType: "manual",
      },
    ]);

    await AuditEvent.create({
      householdId: context.householdId,
      actorUserId: context.userId,
      entityType: "transaction_group",
      entityId: group._id,
      action: "transfer.created",
      metadata: {
        fromAccountId: fromAccount._id.toString(),
        toAccountId: toAccount._id.toString(),
        amountMinor,
        debitEntryId: fromEntry._id.toString(),
        creditEntryId: toEntry._id.toString(),
      },
    });

    return NextResponse.json({
      success: true,
      transactionGroupId: group._id.toString(),
      entryIds: [fromEntry._id.toString(), toEntry._id.toString()],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid transaction payload.", issues: error.issues },
        { status: 400 },
      );
    }

    if (
      error instanceof Error &&
      (error.message === "TRANSACTION_AMOUNT_INVALID" ||
        error.message === "ASSET_EXPENSE_SIGN_INVALID" ||
        error.message === "ASSET_INCOME_SIGN_INVALID" ||
        error.message === "LIABILITY_EXPENSE_SIGN_INVALID" ||
        error.message === "LIABILITY_INCOME_SIGN_INVALID")
    ) {
      return NextResponse.json(
        { message: "Transaction does not satisfy account-type rules." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { message: "Unable to create transaction." },
      { status: 500 },
    );
  }
}
