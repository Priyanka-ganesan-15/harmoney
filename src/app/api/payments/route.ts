import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { toMinorUnits } from "@/lib/money";
import { requireHouseholdContext } from "@/lib/permissions";
import { PaymentAmountOverride } from "@/server/models/payment-amount-override";
import { PaymentReminder } from "@/server/models/payment-reminder";

const createPaymentSchema = z.object({
  label: z.string().min(2).max(120),
  type: z
    .enum([
      "credit_card",
      "rent",
      "mortgage",
      "loan",
      "utilities",
      "subscription",
      "insurance",
      "tax",
      "savings_contribution",
      "investment_contribution",
      "other",
    ])
    .default("other"),
  recurrence: z.enum(["monthly", "quarterly", "annually", "one_time"]).default("monthly"),
  startDate: z.string().datetime(),
  termMonths: z.number().int().min(1).max(600).nullable().optional(),
  amountMode: z.enum(["fixed", "variable"]).default("fixed"),
  baseAmount: z.union([z.string(), z.number()]).nullable().optional(),
  currency: z.string().length(3).default("USD"),
  notes: z.string().max(280).optional().default(""),
  isActive: z.boolean().optional().default(true),
  /** Account the payment is drawn from (e.g. checking). */
  payFromAccountId: z.string().optional().nullable(),
  /** Credit/loan account this payment settles. */
  liabilityAccountId: z.string().optional().nullable(),
  /** Normalized payee name. */
  payeeName: z.string().max(120).optional().nullable(),
  /** Day-of-month this bill is due (1–28). */
  dueDay: z.number().int().min(1).max(28).optional().nullable(),
  /** Budget category for this obligation. */
  linkedCategoryId: z.string().optional().nullable(),
});

function formatMonthKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getScheduledDate(year: number, month: number, anchorDay: number) {
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, lastDayOfMonth)));
}

function getNextDueDate(
  recurrence: "monthly" | "quarterly" | "annually" | "one_time",
  startDate: Date | null,
) {
  const now = new Date();

  if (!startDate) {
    return null;
  }

  if (recurrence === "one_time") {
    return startDate;
  }

  const anchorDay = startDate.getUTCDate();
  const monthStep = recurrence === "monthly" ? 1 : recurrence === "quarterly" ? 3 : 12;
  let year = startDate.getUTCFullYear();
  let month = startDate.getUTCMonth();
  let cursor = getScheduledDate(year, month, anchorDay);

  while (cursor.getTime() < now.getTime()) {
    month += monthStep;
    year += Math.floor(month / 12);
    month %= 12;
    cursor = getScheduledDate(year, month, anchorDay);
  }

  return cursor;
}

export async function GET() {
  try {
    const context = await requireHouseholdContext();

    const reminders = await PaymentReminder.find({
      householdId: context.householdId,
      archivedAt: null,
    })
      .sort({ isActive: -1, createdAt: -1 })
      .lean();

    if (reminders.length === 0) {
      return NextResponse.json({ payments: [] });
    }

    const reminderIds = reminders.map((item) => item._id);

    const overrides = await PaymentAmountOverride.find({
      householdId: context.householdId,
      paymentReminderId: { $in: reminderIds },
    })
      .sort({ monthKey: -1 })
      .lean();

    const overridesByReminder = new Map<string, Array<{ monthKey: string; amountMinor: number }>>();

    for (const override of overrides) {
      const key = override.paymentReminderId.toString();
      const list = overridesByReminder.get(key) ?? [];
      list.push({ monthKey: override.monthKey, amountMinor: override.amountMinor });
      overridesByReminder.set(key, list);
    }

    const currentMonthKey = formatMonthKey(new Date());

    return NextResponse.json({
      payments: reminders.map((item) => {
        const itemOverrides = overridesByReminder.get(item._id.toString()) ?? [];
        const thisMonthOverride = itemOverrides.find((entry) => entry.monthKey === currentMonthKey);
        const resolvedAmountMinor = thisMonthOverride?.amountMinor ?? item.baseAmountMinor ?? 0;

        return {
          id: item._id.toString(),
          label: item.label,
          type: item.type,
          recurrence: item.recurrence,
          startDate: item.startDate,
          termMonths: item.termMonths ?? null,
          amountMode: item.amountMode,
          baseAmountMinor: item.baseAmountMinor ?? null,
          resolvedAmountMinor,
          currency: item.currency,
          notes: item.notes,
          isActive: item.isActive,
          nextDueDate: getNextDueDate(item.recurrence, item.startDate ?? null),
          overrides: itemOverrides,
          payFromAccountId: item.payFromAccountId?.toString() ?? null,
          liabilityAccountId: item.liabilityAccountId?.toString() ?? null,
          payeeName: item.payeeName ?? null,
          dueDay: item.dueDay ?? null,
          linkedCategoryId: item.linkedCategoryId?.toString() ?? null,
        };
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to list payments." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const parsed = createPaymentSchema.parse(await request.json());

    const currency = parsed.currency.toUpperCase();
    const baseAmountMinor =
      parsed.baseAmount !== null && parsed.baseAmount !== undefined
        ? toMinorUnits(Number(parsed.baseAmount), currency)
        : null;

    if (parsed.amountMode === "fixed" && (baseAmountMinor === null || baseAmountMinor <= 0)) {
      return NextResponse.json(
        { message: "Fixed payments require a positive base amount." },
        { status: 400 },
      );
    }

    const payment = await PaymentReminder.create({
      householdId: new Types.ObjectId(context.householdId),
      label: parsed.label.trim(),
      type: parsed.type,
      recurrence: parsed.recurrence,
      startDate: new Date(parsed.startDate),
      termMonths: parsed.termMonths ?? null,
      amountMode: parsed.amountMode,
      baseAmountMinor,
      currency,
      notes: parsed.notes.trim(),
      isActive: parsed.isActive,
      payFromAccountId:
        parsed.payFromAccountId && Types.ObjectId.isValid(parsed.payFromAccountId)
          ? new Types.ObjectId(parsed.payFromAccountId)
          : null,
      liabilityAccountId:
        parsed.liabilityAccountId && Types.ObjectId.isValid(parsed.liabilityAccountId)
          ? new Types.ObjectId(parsed.liabilityAccountId)
          : null,
      payeeName: parsed.payeeName?.trim() ?? null,
      dueDay: parsed.dueDay ?? null,
      linkedCategoryId:
        parsed.linkedCategoryId && Types.ObjectId.isValid(parsed.linkedCategoryId)
          ? new Types.ObjectId(parsed.linkedCategoryId)
          : null,
      createdByUserId: new Types.ObjectId(context.userId),
    });

    return NextResponse.json({ success: true, id: payment._id.toString() });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid payment payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: "Unable to create payment." }, { status: 500 });
  }
}
