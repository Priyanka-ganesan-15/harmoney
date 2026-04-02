import Decimal from "decimal.js";

export type MoneyInput = Decimal.Value;

const MINOR_UNIT_MAP: Record<string, number> = {
  EUR: 2,
  GBP: 2,
  USD: 2,
};

export function toDecimal(value: MoneyInput) {
  return new Decimal(value);
}

export function addMoney(...values: MoneyInput[]) {
  return values.reduce<Decimal>(
    (total, value) => total.plus(toDecimal(value)),
    new Decimal(0),
  );
}

export function toMinorUnits(value: MoneyInput, currency = "USD") {
  const precision = MINOR_UNIT_MAP[currency] ?? 2;
  const multiplier = new Decimal(10).pow(precision);

  return toDecimal(value).times(multiplier).toDecimalPlaces(0).toNumber();
}

export function formatMoney(
  value: MoneyInput,
  currency = "USD",
  locale = "en-US",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: MINOR_UNIT_MAP[currency] ?? 2,
  }).format(toDecimal(value).toNumber());
}
