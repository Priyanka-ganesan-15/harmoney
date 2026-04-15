import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { toMinorUnits } from "@/lib/money";
import { requireHouseholdContext } from "@/lib/permissions";
import { PaymentAmountOverride } from "@/server/models/payment-amount-override";
import { PaymentInstance } from "@/server/models/payment-instance";
import { PaymentReminder } from "@/server/models/payment-reminder";

const updatePaymentSchema = z.object({
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
  recurrence: z.enum(["monthly", "quarterly", "annually", "one_time"]),
  startDate: z.string().datetime(),
  termMonths: z.number().int().min(1).max(600).nullable().optional(),
  amountMode: z.enum(["fixed", "variable"]),
  baseAmount: z.union([z.string(), z.number()]).nullable().optional(),
  currency: z.string().length(3),
  notes: z.string().max(280).optional().default(""),
  isActive: z.boolean(),
  payFromAccountId: z.string().optional().nullable(),
  liabilityAccountId: z.string().optional().nullable(),
  payeeName: z.string().max(120).optional().nullable(),
  dueDay: z.number().int().min(1).max(28).optional().nullable(),
  linkedCategoryId: z.string().optional().nullable(),
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const context = await requireHouseholdContext();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid payment id." }, { status: 400 });
    }

    const parsed = updatePaymentSchema.parse(await request.json());
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

    const payment = await PaymentReminder.findOne({
      _id: id,
      householdId: context.householdId,
      archivedAt: null,
    });

    if (!payment) {
      return NextResponse.json({ message: "Payment not found." }, { status: 404 });
    }

    payment.label = parsed.label.trim();
    payment.type = parsed.type;
    payment.recurrence = parsed.recurrence;
    payment.startDate = new Date(parsed.startDate);
    payment.termMonths = parsed.termMonths ?? null;
    payment.amountMode = parsed.amountMode;
    payment.baseAmountMinor = baseAmountMinor;
    payment.currency = currency;
    payment.notes = parsed.notes.trim();
    payment.isActive = parsed.isActive;
    payment.payFromAccountId =
      parsed.payFromAccountId && Types.ObjectId.isValid(parsed.payFromAccountId)
        ? new Types.ObjectId(parsed.payFromAccountId)
        : null;
    payment.liabilityAccountId =
      parsed.liabilityAccountId && Types.ObjectId.isValid(parsed.liabilityAccountId)
        ? new Types.ObjectId(parsed.liabilityAccountId)
        : null;
    payment.payeeName = parsed.payeeName?.trim() ?? null;
    payment.dueDay = parsed.dueDay ?? null;
    payment.linkedCategoryId =
      parsed.linkedCategoryId && Types.ObjectId.isValid(parsed.linkedCategoryId)
        ? new Types.ObjectId(parsed.linkedCategoryId)
        : null;

    await payment.save();

    // Re-sync upcoming instances so tracker reflects the new amount immediately.
    // Paid and skipped instances keep their recorded values.
    if (baseAmountMinor !== null) {
      await PaymentInstance.updateMany(
        {
          householdId: context.householdId,
          paymentReminderId: payment._id,
          status: "upcoming",
        },
        { $set: { amountMinor: baseAmountMinor, currency } },
      );
    }

    // Delete instances that are now outside the updated term/recurrence.
    // This runs after the reminder is saved so isDueInMonth uses the new settings.
    if (payment.startDate) {
      const startDate = payment.startDate;
      const termMonths = payment.termMonths ?? null;
      const recurrence = payment.recurrence;

      function monthKeyFromDate(date: Date) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, "0");
        return `${y}-${m}`;
      }

      function monthIndex(key: string) {
        const [y, mo] = key.split("-").map(Number);
        return y * 12 + (mo - 1);
      }

      function isOutsideTerm(monthKey: string) {
        const diff = monthIndex(monthKey) - monthIndex(monthKeyFromDate(startDate));
        if (diff < 0) return true;
        if (termMonths && diff >= termMonths) return true;
        if (recurrence === "one_time" && diff !== 0) return true;
        if (recurrence === "quarterly" && diff % 3 !== 0) return true;
        if (recurrence === "annually" && diff % 12 !== 0) return true;
        return false;
      }

      const candidateInstances = await PaymentInstance.find({
        householdId: context.householdId,
        paymentReminderId: payment._id,
        status: "upcoming",
      }).select({ _id: 1, monthKey: 1 }).lean();

      const staleIds = candidateInstances
        .filter((inst) => isOutsideTerm(inst.monthKey))
        .map((inst) => inst._id);

      if (staleIds.length > 0) {
        await PaymentInstance.deleteMany({ _id: { $in: staleIds } });
      }
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
      return NextResponse.json(
        { message: "Invalid payment payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: "Unable to update payment." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const context = await requireHouseholdContext();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid payment id." }, { status: 400 });
    }

    const payment = await PaymentReminder.findOne({
      _id: id,
      householdId: context.householdId,
      archivedAt: null,
    });

    if (!payment) {
      return NextResponse.json({ message: "Payment not found." }, { status: 404 });
    }

    payment.archivedAt = new Date();
    payment.isActive = false;
    await payment.save();

    await PaymentAmountOverride.deleteMany({
      householdId: context.householdId,
      paymentReminderId: payment._id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to archive payment." }, { status: 500 });
  }
}
