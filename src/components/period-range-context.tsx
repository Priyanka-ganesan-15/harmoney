"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type AnalyticsView = "monthly" | "annual";

type PeriodRangeContextValue = {
  view: AnalyticsView;
  setView: (view: AnalyticsView) => void;
  year: number;
  setYear: (year: number) => void;
  month: number;
  setMonth: (month: number) => void;
  queryString: string;
  selectionLabel: string;
};

const PeriodRangeContext = createContext<PeriodRangeContextValue>({
  view: "monthly",
  setView: () => {},
  year: new Date().getUTCFullYear(),
  setYear: () => {},
  month: new Date().getUTCMonth() + 1,
  setMonth: () => {},
  queryString: "",
  selectionLabel: "",
});

export function PeriodRangeProvider({ children }: { children: ReactNode }) {
  const now = new Date();
  const [view, setView] = useState<AnalyticsView>("monthly");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [systemNow, setSystemNow] = useState<Date>(() => new Date());
  const previousSystemPeriodRef = useRef({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  // Keep context aligned with local system clock while preserving manual selections.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSystemNow(new Date());
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const systemYear = systemNow.getFullYear();
  const systemMonth = systemNow.getMonth() + 1;

  useEffect(() => {
    const previous = previousSystemPeriodRef.current;
    const systemChanged = previous.year !== systemYear || previous.month !== systemMonth;

    if (systemChanged) {
      const wasFollowingAnnual = view === "annual" && year === previous.year;
      const wasFollowingMonthly =
        view === "monthly" && year === previous.year && month === previous.month;

      if (wasFollowingAnnual || wasFollowingMonthly) {
        previousSystemPeriodRef.current = { year: systemYear, month: systemMonth };
        const frame = window.requestAnimationFrame(() => {
          setYear(systemYear);
          if (wasFollowingMonthly) {
            setMonth(systemMonth);
          }
        });

        return () => {
          window.cancelAnimationFrame(frame);
        };
      }

      previousSystemPeriodRef.current = { year: systemYear, month: systemMonth };
    }
  }, [month, systemMonth, systemYear, view, year]);

  const query = new URLSearchParams();
  query.set("view", view);
  query.set("year", String(year));
  if (view === "monthly") {
    query.set("month", String(month));
  }

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(new Date(year, month - 1, 1));

  const selectionLabel = view === "annual" ? String(year) : `${monthLabel} ${year}`;

  return (
    <PeriodRangeContext.Provider
      value={{
        view,
        setView,
        year,
        setYear,
        month,
        setMonth,
        queryString: query.toString(),
        selectionLabel,
      }}
    >
      {children}
    </PeriodRangeContext.Provider>
  );
}

export function usePeriodRange(): PeriodRangeContextValue {
  return useContext(PeriodRangeContext);
}

export function recentYearOptions(span: number = 6): number[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  return Array.from({ length: span }, (_, index) => currentYear - index);
}
