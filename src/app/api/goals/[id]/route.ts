import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { toMinorUnits } from "@/lib/money";
import { requireHouseholdContext } from "@/lib/permissions";
import { Goal } from "@/server/models/goal";

const updateGoalSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  targetAmount: z.union([z.string(), z.number()]).optional(),
  currentAmount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().length(3).optional(),
  targetDate: z.string().datetime().optional().nullable(),
  isArchived: z.boolean().optional(),
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const context = await requireHouseholdContext();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid goal id." }, { status: 400 });
    }

    const parsed = updateGoalSchema.parse(await request.json());

    const goal = await Goal.findOne({
      _id: id,
      householdId: context.householdId,
    });

    if (!goal) {
      return NextResponse.json({ message: "Goal not found." }, { status: 404 });
    }

    const currency = (parsed.currency ?? goal.currency).toUpperCase();

    if (parsed.name !== undefined) {
      goal.name = parsed.name.trim();
    }

    if (parsed.targetAmount !== undefined) {
      goal.targetAmountMinor = toMinorUnits(Number(parsed.targetAmount), currency);
    }

    if (parsed.currentAmount !== undefined) {
      goal.currentAmountMinor = toMinorUnits(Number(parsed.currentAmount), currency);
    }

    if (goal.targetAmountMinor <= 0) {
      return NextResponse.json({ message: "Target amount must be greater than zero." }, { status: 400 });
    }

    if (goal.currentAmountMinor < 0) {
      return NextResponse.json({ message: "Current amount cannot be negative." }, { status: 400 });
    }

    goal.currency = currency;

    if (parsed.targetDate !== undefined) {
      goal.targetDate = parsed.targetDate ? new Date(parsed.targetDate) : null;
    }

    if (parsed.isArchived !== undefined) {
      goal.isArchived = parsed.isArchived;
    }

    await goal.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid goal payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: "Unable to update goal." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const context = await requireHouseholdContext();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid goal id." }, { status: 400 });
    }

    const goal = await Goal.findOne({
      _id: id,
      householdId: context.householdId,
    });

    if (!goal) {
      return NextResponse.json({ message: "Goal not found." }, { status: 404 });
    }

    goal.isArchived = true;
    await goal.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to archive goal." }, { status: 500 });
  }
}
