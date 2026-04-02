import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { Household } from "@/server/models/household";
import { HouseholdMembership } from "@/server/models/household-membership";
import { User } from "@/server/models/user";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  name: z.string().min(2).max(80),
  householdName: z.string().min(2).max(120),
});

export async function POST(request: Request) {
  try {
    const payload = registerSchema.parse(await request.json());

    await connectToDatabase();

    const existing = await User.findOne({
      email: payload.email.toLowerCase().trim(),
    }).lean();

    if (existing) {
      return NextResponse.json(
        { message: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const passwordHash = await hash(payload.password, 12);

    const user = await User.create({
      email: payload.email.toLowerCase().trim(),
      name: payload.name.trim(),
      passwordHash,
    });

    const household = await Household.create({
      name: payload.householdName.trim(),
      baseCurrency: "USD",
      createdByUserId: user._id,
    });

    await HouseholdMembership.create({
      householdId: household._id,
      userId: user._id,
      role: "owner",
      status: "active",
    });

    await User.findByIdAndUpdate(user._id, {
      defaultHouseholdId: household._id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid registration payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { message: "Registration failed." },
      { status: 500 },
    );
  }
}
