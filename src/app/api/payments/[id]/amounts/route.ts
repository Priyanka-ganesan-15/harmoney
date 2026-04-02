import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { toMinorUnits } from "@/lib/money";
import { requireHouseholdContext } from "@/lib/permissions";
import { PaymentAmountOverride } from "@/server/models/payment-amount-override";
import { PaymentReminder } from "@/server/models/payment-reminder";

const upsertOverrideSchema = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().length(3).default("USD"),
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const context = await requireHouseholdContext();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid payment id." }, { status: 400 });
    }

    const parsed = upsertOverrideSchema.parse(await request.json());

    const payment = await PaymentReminder.findOne({
      _id: id,
      householdId: context.householdId,
      archivedAt: null,
    })
      .select({ amountMode: 1, currency: 1 })
      .lean();

    if (!payment) {
      return NextResponse.json({ message: "Payment not found." }, { status: 404 });
    }

    if (payment.amountMode !== "variable") {
      return NextResponse.json(
        { message: "Amount overrides are only supported for variable payments." },
        { status: 400 },
      );
    }

    const currency = parsed.currency.toUpperCase();
    const amountMinor = toMinorUnits(Number(parsed.amount), currency);

    await PaymentAmountOverride.findOneAndUpdate(
      {
        householdId: context.householdId,
        paymentReminderId: new Types.ObjectId(id),
        monthKey: parsed.monthKey,
      },
      {
        $set: {
          amountMinor,
          createdByUserId: new Types.ObjectId(context.userId),
        },
      },
      { upsert: true, new: true },
    );

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
        { message: "Invalid payment override payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { message: "Unable to save payment amount override." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const context = await requireHouseholdContext();
    const { id } = await params;
    const url = new URL(request.url);
    const monthKey = url.searchParams.get("monthKey") ?? "";

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid payment id." }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return NextResponse.json({ message: "Invalid month key." }, { status: 400 });
    }

    await PaymentAmountOverride.deleteOne({
      householdId: context.householdId,
      paymentReminderId: new Types.ObjectId(id),
      monthKey,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { message: "Unable to delete payment amount override." },
      { status: 500 },
    );
  }
}
