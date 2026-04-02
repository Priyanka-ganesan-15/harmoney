import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/permissions";
import { RecurringExpense } from "@/server/models/recurring-expense";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireHouseholdContext();
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid recurring expense id." }, { status: 400 });
    }

    // Verify ownership
    const existing = await RecurringExpense.findOne({
      _id: id,
      householdId: context.householdId,
    }).lean();

    if (!existing) {
      return NextResponse.json(
        { message: "Recurring expense not found." },
        { status: 404 },
      );
    }

    await RecurringExpense.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { message: "Unable to delete recurring expense." },
      { status: 500 },
    );
  }
}
