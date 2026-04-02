import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { toMinorUnits } from "@/lib/money";
import { requireHouseholdContext } from "@/lib/permissions";
import { Category } from "@/server/models/category";
import { RecurringExpense } from "@/server/models/recurring-expense";

const createRecurringExpenseSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  frequency: z
    .enum(["monthly", "weekly", "biweekly", "quarterly", "annually"])
    .default("monthly"),
  currency: z.string().length(3).default("USD"),
  isActive: z.boolean().default(true),
});

const updateRecurringExpenseSchema = createRecurringExpenseSchema.extend({
  id: z.string().min(1),
});

type UpdateRecurringExpenseInput = z.infer<typeof updateRecurringExpenseSchema>;

export async function GET(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("activeOnly") === "true";

    const query = { householdId: context.householdId };
    if (activeOnly) {
      (query as Record<string, unknown>).isActive = true;
    }

    const recurring = await RecurringExpense.find(query)
      .populate("categoryId", "name kind")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      recurring: recurring.map((item) => ({
        id: item._id.toString(),
        categoryId: (item.categoryId as unknown as { _id: string }).toString?.() ||
          (item.categoryId as unknown as { _id: string })._id.toString(),
        categoryName: (item.categoryId as unknown as { name: string }).name,
        amountMinor: item.amountMinor,
        frequency: item.frequency,
        currency: item.currency,
        isActive: item.isActive,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load recurring expenses." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const body = await request.json();

    // Determine if this is a create or update
    const isUpdate = "id" in body;
    const parsed = isUpdate
      ? updateRecurringExpenseSchema.parse(body)
      : createRecurringExpenseSchema.parse(body);

    if (!Types.ObjectId.isValid(parsed.categoryId)) {
      return NextResponse.json({ message: "Invalid category id." }, { status: 400 });
    }

    const category = await Category.findOne({
      _id: parsed.categoryId,
      householdId: context.householdId,
      kind: "expense",
      archivedAt: null,
    }).lean();

    if (!category) {
      return NextResponse.json({ message: "Category not found." }, { status: 404 });
    }

    const currency = parsed.currency.toUpperCase();
    const amountMinor = toMinorUnits(Number(parsed.amount || 0), currency);

    if (isUpdate) {
      const recurringId = (parsed as UpdateRecurringExpenseInput).id;

      if (!Types.ObjectId.isValid(recurringId)) {
        return NextResponse.json({ message: "Invalid recurring expense id." }, { status: 400 });
      }

      // Verify ownership
      const existing = await RecurringExpense.findOne({
        _id: recurringId,
        householdId: context.householdId,
      }).lean();

      if (!existing) {
        return NextResponse.json(
          { message: "Recurring expense not found." },
          { status: 404 },
        );
      }

      await RecurringExpense.findByIdAndUpdate(
        recurringId,
        {
          categoryId: new Types.ObjectId(parsed.categoryId),
          amountMinor,
          frequency: parsed.frequency,
          currency,
          isActive: parsed.isActive,
        },
        { new: true },
      );

      return NextResponse.json({ success: true, id: recurringId });
    }

    // Create new
    const newRecurring = new RecurringExpense({
      householdId: context.householdId,
      categoryId: new Types.ObjectId(parsed.categoryId),
      amountMinor,
      frequency: parsed.frequency,
      currency,
      isActive: parsed.isActive,
      createdByUserId: context.userId,
    });

    await newRecurring.save();

    return NextResponse.json({ success: true, id: newRecurring._id.toString() });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid recurring expense payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { message: "Unable to save recurring expense." },
      { status: 500 },
    );
  }
}
