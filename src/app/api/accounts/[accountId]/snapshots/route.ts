import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { AccountBalanceSnapshot } from "@/server/models/account-balance-snapshot";

const createSnapshotSchema = z.object({
  /** ISO date string — time component is ignored; stored as UTC midnight. */
  snapshotDate: z.string().min(1),
  /** Balance in major currency units (e.g. dollars). Converted to minor units server-side. */
  balance: z.union([z.string(), z.number()]),
  currency: z.string().length(3).default("USD"),
  source: z.enum(["manual", "imported", "system"]).default("manual"),
});

type Params = { params: Promise<{ accountId: string }> };

function toMinorUnits(major: number): number {
  return Math.round(major * 100);
}

function toUtcMidnight(iso: string): Date {
  // Accept "YYYY-MM-DD" or full ISO; strip time and build UTC midnight.
  const dateOnly = iso.slice(0, 10);
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export async function GET(request: Request, { params }: Params) {
  try {
    await connectToDatabase();
    const context = await requireHouseholdContext();
    const { accountId } = await params;

    if (!Types.ObjectId.isValid(accountId)) {
      return NextResponse.json({ message: "Invalid account id." }, { status: 400 });
    }

    const visibilityQuery = buildVisibilityQuery(context.userId);

    // Verify the account belongs to this household and is visible.
    const account = await Account.findOne({
      _id: accountId,
      householdId: context.householdId,
      archivedAt: null,
      ...visibilityQuery,
    })
      .select({ _id: 1, currency: 1 })
      .lean();

    if (!account) {
      return NextResponse.json({ message: "Account not found." }, { status: 404 });
    }

    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") ?? "24");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.floor(limitParam), 1), 120)
      : 24;

    const snapshots = await AccountBalanceSnapshot.find({ accountId })
      .sort({ snapshotDate: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      snapshots: snapshots.map((s) => ({
        id: s._id.toString(),
        snapshotDate: s.snapshotDate,
        balanceMinor: s.balanceMinor,
        currency: s.currency,
        source: s.source,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load snapshots." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    await connectToDatabase();
    const context = await requireHouseholdContext();
    const { accountId } = await params;

    if (!Types.ObjectId.isValid(accountId)) {
      return NextResponse.json({ message: "Invalid account id." }, { status: 400 });
    }

    const visibilityQuery = buildVisibilityQuery(context.userId);

    const account = await Account.findOne({
      _id: accountId,
      householdId: context.householdId,
      archivedAt: null,
      ...visibilityQuery,
    })
      .select({ _id: 1, currency: 1 })
      .lean();

    if (!account) {
      return NextResponse.json({ message: "Account not found." }, { status: 404 });
    }

    const parsed = createSnapshotSchema.parse(await request.json());
    const currency = parsed.currency.toUpperCase();
    const balanceMinor = toMinorUnits(Number(parsed.balance));

    if (!Number.isFinite(balanceMinor)) {
      return NextResponse.json({ message: "Invalid balance value." }, { status: 400 });
    }

    const snapshotDate = toUtcMidnight(parsed.snapshotDate);
    if (isNaN(snapshotDate.getTime())) {
      return NextResponse.json({ message: "Invalid snapshot date." }, { status: 400 });
    }

    const snapshot = await AccountBalanceSnapshot.create({
      householdId: new Types.ObjectId(context.householdId),
      accountId: new Types.ObjectId(accountId),
      snapshotDate,
      balanceMinor,
      currency,
      source: parsed.source,
    });

    return NextResponse.json(
      {
        success: true,
        id: snapshot._id.toString(),
        snapshotDate: snapshot.snapshotDate,
        balanceMinor: snapshot.balanceMinor,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid snapshot data.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: "Unable to create snapshot." }, { status: 500 });
  }
}
