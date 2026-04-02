import { NextResponse } from "next/server";
import { z } from "zod";
import { toMinorUnits } from "@/lib/money";
import { requireHouseholdContext } from "@/lib/permissions";
import { Goal } from "@/server/models/goal";

const goalSchema = z.object({
  name: z.string().min(2).max(120),
  targetAmount: z.union([z.string(), z.number()]),
  currentAmount: z.union([z.string(), z.number()]).optional().default("0"),
  currency: z.string().length(3).default("USD"),
  targetDate: z.string().datetime().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("activeOnly") === "true";

    const query: Record<string, unknown> = {
      householdId: context.householdId,
    };

    if (activeOnly) {
      query.isArchived = false;
    }

    const goals = await Goal.find(query).sort({ createdAt: -1 }).lean();

    const totals = goals.reduce(
      (running, goal) => {
        running.targetAmountMinor += goal.targetAmountMinor;
        running.currentAmountMinor += goal.currentAmountMinor;
        return running;
      },
      { targetAmountMinor: 0, currentAmountMinor: 0 },
    );

    return NextResponse.json({
      totals: {
        ...totals,
        completionPercent:
          totals.targetAmountMinor > 0
            ? Math.round((totals.currentAmountMinor / totals.targetAmountMinor) * 100)
            : 0,
      },
      goals: goals.map((goal) => ({
        id: goal._id.toString(),
        name: goal.name,
        targetAmountMinor: goal.targetAmountMinor,
        currentAmountMinor: goal.currentAmountMinor,
        currency: goal.currency,
        targetDate: goal.targetDate,
        isArchived: goal.isArchived,
        createdAt: goal.createdAt,
        completionPercent:
          goal.targetAmountMinor > 0
            ? Math.min(Math.round((goal.currentAmountMinor / goal.targetAmountMinor) * 100), 100)
            : 0,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load goals." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const parsed = goalSchema.parse(await request.json());

    const currency = parsed.currency.toUpperCase();
    const targetAmountMinor = toMinorUnits(Number(parsed.targetAmount), currency);
    const currentAmountMinor = toMinorUnits(Number(parsed.currentAmount), currency);

    if (targetAmountMinor <= 0) {
      return NextResponse.json({ message: "Target amount must be greater than zero." }, { status: 400 });
    }

    if (currentAmountMinor < 0) {
      return NextResponse.json({ message: "Current amount cannot be negative." }, { status: 400 });
    }

    const goal = await Goal.create({
      householdId: context.householdId,
      name: parsed.name.trim(),
      targetAmountMinor,
      currentAmountMinor,
      currency,
      targetDate: parsed.targetDate ? new Date(parsed.targetDate) : null,
      isArchived: false,
      createdByUserId: context.userId,
    });

    return NextResponse.json({ success: true, id: goal._id.toString() });
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

    return NextResponse.json({ message: "Unable to create goal." }, { status: 500 });
  }
}
