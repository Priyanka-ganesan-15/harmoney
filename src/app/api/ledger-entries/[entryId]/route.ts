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

const updateEntrySchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.union([z.string(), z.number()]),
  description: z.string().max(200).optional().default(""),
  occurredAt: z.string().datetime().optional(),
  categoryId: z.string().min(1).optional(),
});

type Params = {
  params: Promise<{ entryId: string }>;
};

function toMonthKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

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
    const { entryId } = await params;

    if (!Types.ObjectId.isValid(entryId)) {
      return NextResponse.json({ message: "Invalid entry id." }, { status: 400 });
    }

    const parsed = updateEntrySchema.parse(await request.json());

    const entry = await LedgerEntry.findOne({
      _id: entryId,
      householdId: context.householdId,
      ...visibilityQuery,
    });

    if (!entry) {
      return NextResponse.json({ message: "Transaction not found." }, { status: 404 });
    }

    const period = await BudgetPeriod.findOne({
      householdId: context.householdId,
      monthKey: toMonthKey(entry.occurredAt),
    })
      .select({ status: 1 })
      .lean();

    if (period?.status === "closed") {
      return NextResponse.json(
        { message: "This period is closed. Reopen it to edit transactions." },
        { status: 409 },
      );
    }

    if (entry.entryType === "opening_balance") {
      return NextResponse.json(
        { message: "Opening balance transactions cannot be edited." },
        { status: 400 },
      );
    }

    if (entry.entryType === "transfer_in" || entry.entryType === "transfer_out") {
      return NextResponse.json(
        { message: "Transfer transactions cannot be edited." },
        { status: 400 },
      );
    }

    const account = await Account.findOne({
      _id: entry.accountId,
      householdId: context.householdId,
      ...visibilityQuery,
    }).lean();

    if (!account) {
      return NextResponse.json({ message: "Account not found." }, { status: 404 });
    }

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

    const normalized = toMinorUnits(Number(parsed.amount), account.currency);
    const signedAmount = toSignedAmountMinorByAccountKind(
      account.kind,
      parsed.type,
      normalized,
    );

    assertTransactionSignInvariant(account.kind, parsed.type, signedAmount);

    entry.entryType = parsed.type;
    entry.amountMinor = signedAmount;
    entry.description = parsed.description.trim();
    entry.occurredAt = parsed.occurredAt ? new Date(parsed.occurredAt) : entry.occurredAt;
    entry.categoryId = categoryObjectId;

    await entry.save();

    await AuditEvent.create({
      householdId: context.householdId,
      actorUserId: context.userId,
      entityType: "ledger_entry",
      entityId: entry._id,
      action: "ledger_entry.updated",
      metadata: {
        entryType: parsed.type,
        amountMinor: signedAmount,
        categoryId: categoryObjectId?.toString() ?? null,
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

    return NextResponse.json({ message: "Unable to update transaction." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const { entryId } = await params;

    if (!Types.ObjectId.isValid(entryId)) {
      return NextResponse.json({ message: "Invalid entry id." }, { status: 400 });
    }

    const entry = await LedgerEntry.findOne({
      _id: entryId,
      householdId: context.householdId,
      ...visibilityQuery,
    });

    if (!entry) {
      return NextResponse.json({ message: "Transaction not found." }, { status: 404 });
    }

    const period = await BudgetPeriod.findOne({
      householdId: context.householdId,
      monthKey: toMonthKey(entry.occurredAt),
    })
      .select({ status: 1 })
      .lean();

    if (period?.status === "closed") {
      return NextResponse.json(
        { message: "This period is closed. Reopen it to edit transactions." },
        { status: 409 },
      );
    }

    if (entry.entryType === "opening_balance") {
      return NextResponse.json(
        { message: "Opening balance transactions cannot be deleted." },
        { status: 400 },
      );
    }

    const group = await TransactionGroup.findById(entry.transactionGroupId).lean();

    if (
      group?.type === "transfer" &&
      (entry.entryType === "transfer_in" || entry.entryType === "transfer_out")
    ) {
      const deleted = await LedgerEntry.deleteMany({
        householdId: context.householdId,
        transactionGroupId: entry.transactionGroupId,
        ...visibilityQuery,
      });

      await TransactionGroup.deleteOne({ _id: entry.transactionGroupId });

      await AuditEvent.create({
        householdId: context.householdId,
        actorUserId: context.userId,
        entityType: "transaction_group",
        entityId: entry.transactionGroupId,
        action: "transfer.deleted",
        metadata: {
          deletedEntries: deleted.deletedCount,
        },
      });

      return NextResponse.json({ success: true, deletedTransfer: true });
    }

    await LedgerEntry.deleteOne({ _id: entry._id });

    const remainingGroupEntries = await LedgerEntry.countDocuments({
      householdId: context.householdId,
      transactionGroupId: entry.transactionGroupId,
      ...visibilityQuery,
    });

    if (remainingGroupEntries === 0) {
      await TransactionGroup.deleteOne({ _id: entry.transactionGroupId });
    }

    await AuditEvent.create({
      householdId: context.householdId,
      actorUserId: context.userId,
      entityType: "ledger_entry",
      entityId: entry._id,
      action: "ledger_entry.deleted",
      metadata: {
        entryType: entry.entryType,
        amountMinor: entry.amountMinor,
      },
    });

    return NextResponse.json({ success: true, deletedTransfer: false });
  } catch (error) {
    const authError = handleAuthError(error);

    if (authError) {
      return authError;
    }

    return NextResponse.json({ message: "Unable to delete transaction." }, { status: 500 });
  }
}
