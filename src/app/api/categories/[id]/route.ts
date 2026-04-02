import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/permissions";
import { BudgetLine } from "@/server/models/budget-line";
import { Category } from "@/server/models/category";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { RecurringExpense } from "@/server/models/recurring-expense";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireHouseholdContext();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid category id." }, { status: 400 });
    }

    const categoryId = new Types.ObjectId(id);

    // Verify category exists and belongs to household
    const category = await Category.findOne({
      _id: categoryId,
      householdId: context.householdId,
    }).lean();

    if (!category) {
      return NextResponse.json({ message: "Category not found." }, { status: 404 });
    }

    // Start a transaction-like operation
    // 1. Nullify all ledger entries with this category
    await LedgerEntry.updateMany(
      {
        householdId: context.householdId,
        categoryId,
      },
      { $set: { categoryId: null } },
    );

    // 2. Delete all budget lines for this category
    await BudgetLine.deleteMany({
      householdId: context.householdId,
      categoryId,
    });

    // 3. Delete all recurring expenses for this category
    await RecurringExpense.deleteMany({
      householdId: context.householdId,
      categoryId,
    });

    // 4. Delete the category itself
    const result = await Category.deleteOne({
      _id: categoryId,
      householdId: context.householdId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ message: "Category not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to delete category." }, { status: 500 });
  }
}
