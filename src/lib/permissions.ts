import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { HouseholdMembership } from "@/server/models/household-membership";

export type AuthContext = {
  userId: string;
  householdId: string;
};

export async function requireHouseholdContext(): Promise<AuthContext> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.householdId) {
    throw new Error("UNAUTHORIZED");
  }

  await connectToDatabase();

  const membership = await HouseholdMembership.findOne({
    householdId: session.user.householdId,
    userId: session.user.id,
    status: "active",
  }).lean();

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  return {
    userId: session.user.id,
    householdId: session.user.householdId,
  };
}

export function buildVisibilityQuery(userId: string) {
  const memberId = new Types.ObjectId(userId);

  return {
    $or: [{ accessScope: "shared" }, { visibleToMemberIds: memberId }],
  };
}
