/**
 * Calendar dates ("2026-09-30") with no time and no time zone.
 *
 * `new Date("2026-09-30")` parses as UTC midnight, which is still 29 Sep in
 * any zone west of Greenwich. So this module never parses a date-only string
 * with `Date`: it validates the text, compares it as text (ISO dates sort
 * correctly as strings) and does day arithmetic with Date.UTC on the parts.
 */
declare const isoDateBrand: unique symbol;
export type IsoDate = string & { readonly [isoDateBrand]: true };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const day = Number.parseInt(match[3] ?? "", 10);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseIsoDate(value: unknown, label: string): IsoDate {
  if (!isIsoDate(value)) {
    throw new TypeError(`${label} must be a calendar date like 2026-09-30, got ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertIsoDate(value: unknown, label = "date"): asserts value is IsoDate {
  parseIsoDate(value, label);
}

/** Negative if a is before b, 0 if the same day, positive if after. */
export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Today's calendar date in the officer's local zone. */
export function todayIsoDate(now: Date = new Date()): IsoDate {
  const y = now.getFullYear().toString().padStart(4, "0");
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}` as IsoDate;
}

function toDayNumber(date: IsoDate): number {
  const [y, m, d] = date.split("-").map((part) => Number.parseInt(part, 10));
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000;
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-30" → "30 Sep 2026", without going through Date. */
export function formatIsoDate(date: IsoDate): string {
  const [y, m, d] = date.split("-");
  const month = MONTHS[Number.parseInt(m ?? "1", 10) - 1] ?? "";
  return `${Number.parseInt(d ?? "1", 10)} ${month} ${y ?? ""}`;
}
