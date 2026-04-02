import { NextResponse } from "next/server";
import { hashToken } from "@/lib/crypto";
import { connectToDatabase } from "@/lib/db";
import { Household } from "@/server/models/household";
import { Invite } from "@/server/models/invite";

type Params = {
  params: Promise<{ token: string }>;
};

export async function GET(_: Request, { params }: Params) {
  const { token } = await params;

  await connectToDatabase();

  const invite = await Invite.findOne({
    tokenHash: hashToken(token),
    status: "pending",
  }).lean();

  if (!invite || new Date(invite.expiresAt) < new Date()) {
    return NextResponse.json({ valid: false }, { status: 404 });
  }

  const household = await Household.findById(invite.householdId).lean();

  return NextResponse.json({
    valid: true,
    email: invite.email,
    householdName: household?.name ?? "your household",
  });
}
