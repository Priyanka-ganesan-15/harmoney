import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hashToken } from "@/lib/crypto";
import { connectToDatabase } from "@/lib/db";
import { HouseholdMembership } from "@/server/models/household-membership";
import { Invite } from "@/server/models/invite";
import { User } from "@/server/models/user";

const acceptInviteSchema = z.object({
  password: z.string().min(10),
  name: z.string().min(2).max(80),
});

type Params = {
  params: Promise<{ token: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;

  const payload = acceptInviteSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "Invalid invite payload." }, { status: 400 });
  }

  await connectToDatabase();

  const invite = await Invite.findOne({
    tokenHash: hashToken(token),
    status: "pending",
  });

  if (!invite || invite.expiresAt < new Date()) {
    return NextResponse.json(
      { message: "Invite is invalid or expired." },
      { status: 404 },
    );
  }

  const existing = await User.findOne({ email: invite.email }).lean();

  if (existing) {
    return NextResponse.json(
      { message: "An account with this email already exists. Please log in." },
      { status: 409 },
    );
  }

  const passwordHash = await hash(payload.data.password, 12);

  const user = await User.create({
    email: invite.email,
    name: payload.data.name.trim(),
    passwordHash,
    defaultHouseholdId: invite.householdId,
  });

  await HouseholdMembership.create({
    householdId: invite.householdId,
    userId: user._id,
    role: "partner",
    status: "active",
  });

  invite.status = "accepted";
  invite.acceptedAt = new Date();
  await invite.save();

  return NextResponse.json({ success: true });
}
