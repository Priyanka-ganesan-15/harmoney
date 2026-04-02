import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/permissions";
import { PaymentAmountOverride } from "@/server/models/payment-amount-override";
import { PaymentInstance } from "@/server/models/payment-instance";
import { PaymentReminder } from "@/server/models/payment-reminder";

type Recurrence = "monthly" | "quarterly" | "annually" | "one_time";

function monthKeyFromDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthIndex(monthKey: string) {
  const [year, month] = monthKey.split("-").map((value) => Number(value));
  return year * 12 + (month - 1);
}

function monthsFromBase(baseMonthKey: string, count: number) {
  const [baseYear, baseMonth] = baseMonthKey.split("-").map((value) => Number(value));
  return Array.from({ length: count }, (_, index) => {
    const cursor = new Date(Date.UTC(baseYear, baseMonth - 1 + index, 1));
    return monthKeyFromDate(cursor);
  });
}

function getScheduledDate(year: number, month: number, anchorDay: number) {
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, lastDayOfMonth)));
}

function isDueInMonth(
  recurrence: Recurrence,
  startDate: Date,
  termMonths: number | null,
  targetMonthKey: string,
) {
  const startMonthKey = monthKeyFromDate(startDate);
  const diff = monthIndex(targetMonthKey) - monthIndex(startMonthKey);

  if (diff < 0) {
    return false;
  }

  if (termMonths && termMonths > 0 && diff >= termMonths) {
    return false;
  }

  if (recurrence === "one_time") {
    return diff === 0;
  }

  if (recurrence === "monthly") {
    return true;
  }

  if (recurrence === "quarterly") {
    return diff % 3 === 0;
  }

  if (recurrence === "annually") {
    return diff % 12 === 0;
  }

  return true;
}

function dueDateForMonth(startDate: Date, monthKey: string) {
  const [year, month] = monthKey.split("-").map((value) => Number(value));
  return getScheduledDate(year, month - 1, startDate.getUTCDate());
}

export async function GET(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const url = new URL(request.url);
    const monthsParam = Number(url.searchParams.get("months") ?? "6");
    const months = Number.isFinite(monthsParam)
      ? Math.min(Math.max(Math.floor(monthsParam), 1), 24)
      : 6;

    const currentMonthKey = monthKeyFromDate(new Date());
    const monthKeys = monthsFromBase(currentMonthKey, months);

    const reminders = await PaymentReminder.find({
      householdId: context.householdId,
      archivedAt: null,
      isActive: true,
    })
      .select({
        _id: 1,
        label: 1,
        type: 1,
        recurrence: 1,
        startDate: 1,
        termMonths: 1,
        baseAmountMinor: 1,
        currency: 1,
      })
      .lean();

    if (reminders.length === 0) {
      return NextResponse.json({ instances: [] });
    }

    const reminderIds = reminders.map((item) => item._id);

    const [overrides, existingInstances] = await Promise.all([
      PaymentAmountOverride.find({
        householdId: context.householdId,
        paymentReminderId: { $in: reminderIds },
        monthKey: { $in: monthKeys },
      })
        .select({ paymentReminderId: 1, monthKey: 1, amountMinor: 1 })
        .lean(),
      PaymentInstance.find({
        householdId: context.householdId,
        paymentReminderId: { $in: reminderIds },
        monthKey: { $in: monthKeys },
      })
        .sort({ dueDate: 1 })
        .lean(),
    ]);

    const overrideMap = new Map<string, number>();
    for (const entry of overrides) {
      overrideMap.set(
        `${entry.paymentReminderId.toString()}::${entry.monthKey}`,
        entry.amountMinor,
      );
    }

    const existingKeys = new Set(
      existingInstances.map(
        (item) => `${item.paymentReminderId.toString()}::${item.monthKey}`,
      ),
    );

    const toCreate: Array<{
      householdId: Types.ObjectId;
      paymentReminderId: Types.ObjectId;
      monthKey: string;
      dueDate: Date;
      amountMinor: number;
      currency: string;
      status: "upcoming";
      createdByUserId: Types.ObjectId;
    }> = [];

    for (const reminder of reminders) {
      if (!reminder.startDate) {
        continue;
      }

      for (const monthKey of monthKeys) {
        if (
          !isDueInMonth(
            reminder.recurrence as Recurrence,
            reminder.startDate,
            reminder.termMonths ?? null,
            monthKey,
          )
        ) {
          continue;
        }

        const key = `${reminder._id.toString()}::${monthKey}`;
        if (existingKeys.has(key)) {
          continue;
        }

        const overrideAmount = overrideMap.get(key);
        const amountMinor = overrideAmount ?? reminder.baseAmountMinor ?? 0;

        toCreate.push({
          householdId: new Types.ObjectId(context.householdId),
          paymentReminderId: new Types.ObjectId(reminder._id.toString()),
          monthKey,
          dueDate: dueDateForMonth(reminder.startDate, monthKey),
          amountMinor,
          currency: reminder.currency,
          status: "upcoming",
          createdByUserId: new Types.ObjectId(context.userId),
        });
      }
    }

    if (toCreate.length > 0) {
      await PaymentInstance.insertMany(toCreate, { ordered: false }).catch(() => null);
    }

    const instances = await PaymentInstance.find({
      householdId: context.householdId,
      paymentReminderId: { $in: reminderIds },
      monthKey: { $in: monthKeys },
    })
      .sort({ dueDate: 1 })
      .lean();

    const reminderMap = new Map(reminders.map((item) => [item._id.toString(), item]));

    // Filter instances against current term/recurrence settings and clean up stale ones.
    const staleInstanceIds: string[] = [];
    const validInstances = instances.filter((instance) => {
      const reminder = reminderMap.get(instance.paymentReminderId.toString());
      if (!reminder?.startDate) {
        staleInstanceIds.push(instance._id.toString());
        return false;
      }
      const valid = isDueInMonth(
        reminder.recurrence as Recurrence,
        reminder.startDate,
        reminder.termMonths ?? null,
        instance.monthKey,
      );
      if (!valid) {
        staleInstanceIds.push(instance._id.toString());
      }
      return valid;
    });

    if (staleInstanceIds.length > 0) {
      await PaymentInstance.deleteMany({ _id: { $in: staleInstanceIds } }).catch(() => null);
    }

    return NextResponse.json({
      instances: validInstances
        .map((instance) => {
          const reminder = reminderMap.get(instance.paymentReminderId.toString());
          if (!reminder) {
            return null;
          }

          return {
            id: instance._id.toString(),
            paymentReminderId: instance.paymentReminderId.toString(),
            label: reminder.label,
            type: reminder.type,
            monthKey: instance.monthKey,
            dueDate: instance.dueDate,
            amountMinor: instance.amountMinor,
            currency: instance.currency,
            status: instance.status,
            paidAt: instance.paidAt,
            paidAmountMinor: instance.paidAmountMinor,
          };
        })
        .filter(Boolean),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { message: "Unable to load payment instances." },
      { status: 500 },
    );
  }
}
