import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { generateToken, hashToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { connectToDatabase } from "@/lib/db";
import { HouseholdMembership } from "@/server/models/household-membership";
import { Invite } from "@/server/models/invite";

const inviteSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.householdId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = inviteSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "Invalid invite payload." }, { status: 400 });
  }

  await connectToDatabase();

  const membership = await HouseholdMembership.findOne({
    householdId: session.user.householdId,
    userId: session.user.id,
    role: "owner",
    status: "active",
  }).lean();

  if (!membership) {
    return NextResponse.json(
      { message: "Only household owners can invite partners." },
      { status: 403 },
    );
  }

  const rawToken = generateToken(24);
  const tokenHash = hashToken(rawToken);

  await Invite.create({
    householdId: session.user.householdId,
    email: payload.data.email.toLowerCase().trim(),
    tokenHash,
    invitedByUserId: session.user.id,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3),
    status: "pending",
  });

  return NextResponse.json({
    success: true,
    inviteUrl: `${env.NEXTAUTH_URL}/invite/${rawToken}`,
  });
}
