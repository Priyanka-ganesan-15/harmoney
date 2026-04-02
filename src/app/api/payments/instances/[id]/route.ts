import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { toMinorUnits } from "@/lib/money";
import { requireHouseholdContext } from "@/lib/permissions";
import { PaymentInstance } from "@/server/models/payment-instance";

const updateStatusSchema = z.object({
  status: z.enum(["upcoming", "paid", "skipped"]),
  paidAmount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().length(3).optional(),
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const context = await requireHouseholdContext();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid payment instance id." }, { status: 400 });
    }

    const parsed = updateStatusSchema.parse(await request.json());

    const instance = await PaymentInstance.findOne({
      _id: id,
      householdId: context.householdId,
    });

    if (!instance) {
      return NextResponse.json({ message: "Payment instance not found." }, { status: 404 });
    }

    instance.status = parsed.status;

    if (parsed.status === "paid") {
      const currency = (parsed.currency ?? instance.currency).toUpperCase();
      instance.paidAt = new Date();
      instance.paidAmountMinor =
        parsed.paidAmount !== undefined
          ? toMinorUnits(Number(parsed.paidAmount), currency)
          : instance.amountMinor;
    } else {
      instance.paidAt = null;
      instance.paidAmountMinor = null;
    }

    await instance.save();

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
        { message: "Invalid payment instance payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { message: "Unable to update payment instance." },
      { status: 500 },
    );
  }
}
