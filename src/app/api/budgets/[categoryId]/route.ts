import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/permissions";
import { BudgetLine } from "@/server/models/budget-line";
import { BudgetPeriod } from "@/server/models/budget-period";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  try {
    const context = await requireHouseholdContext();
    const { categoryId } = await params;
    const url = new URL(request.url);
    const month = monthSchema.parse(url.searchParams.get("month"));

    if (!Types.ObjectId.isValid(categoryId)) {
      return NextResponse.json({ message: "Invalid category id." }, { status: 400 });
    }

    const period = await BudgetPeriod.findOne({
      householdId: context.householdId,
      monthKey: month,
    })
      .select({ status: 1 })
      .lean();

    if (period?.status === "closed") {
      return NextResponse.json(
        { message: "This period is closed. Reopen it to delete budgets." },
        { status: 409 },
      );
    }

    const result = await BudgetLine.deleteOne({
      householdId: context.householdId,
      monthKey: month,
      categoryId: new Types.ObjectId(categoryId),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { message: "Budget line not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Invalid month format." }, { status: 400 });
    }

    return NextResponse.json({ message: "Unable to delete budget line." }, { status: 500 });
  }
}
