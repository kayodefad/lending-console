import { compareIsoDate, parseIsoDate, type IsoDate } from "./dates";
import { parseKoboString, sumKobo, type Kobo } from "./money";

/** Components of an instalment, in waterfall order: a payment clears them left to right. */
export const COMPONENTS = ["penalty", "fee", "interest", "principal"] as const;
export type ComponentName = (typeof COMPONENTS)[number];

export interface ComponentAmounts {
  readonly due: Kobo;
  readonly paid: Kobo;
}

/**
 * One scheduled instalment. A missing component means nothing was due on it
 * (the brief's example has no penalty or fee on instalment 2), so every
 * calculation reads components through `componentOf`.
 */
export interface Instalment {
  readonly number: number;
  readonly dueDate: IsoDate;
  readonly penalty?: ComponentAmounts;
  readonly fee?: ComponentAmounts;
  readonly interest?: ComponentAmounts;
  readonly principal?: ComponentAmounts;
}

export interface Loan {
  readonly id: string;
  readonly customerName: string;
  readonly productName: string;
  readonly currency: "NGN";
  readonly principal: Kobo;
  /** Display text from the server, e.g. "1.5% per month". Never used in calculations. */
  readonly interestRateLabel: string;
  readonly disbursedOn: IsoDate;
  /** Customer credit already held on the loan (a liability). */
  readonly unappliedCredit: Kobo;
  readonly instalments: readonly Instalment[];
}

export type InstalmentStatus = "PAID" | "UPCOMING" | "OVERDUE" | "PARTIAL" | "DUE";

export class LoanDataError extends Error {
  override readonly name = "LoanDataError";
}

const NOTHING_DUE: ComponentAmounts = Object.freeze({ due: 0n, paid: 0n });

/** A component's amounts; a missing component counts as nothing due and nothing paid. */
export function componentOf(instalment: Instalment, name: ComponentName): ComponentAmounts {
  return instalment[name] ?? NOTHING_DUE;
}

export function componentOutstanding(amounts: ComponentAmounts): Kobo {
  return amounts.due - amounts.paid;
}

export function instalmentOutstanding(instalment: Instalment): Kobo {
  return sumKobo(COMPONENTS.map((name) => componentOutstanding(componentOf(instalment, name))));
}

export function instalmentPaid(instalment: Instalment): Kobo {
  return sumKobo(COMPONENTS.map((name) => componentOf(instalment, name).paid));
}

export function instalmentDue(instalment: Instalment): Kobo {
  return sumKobo(COMPONENTS.map((name) => componentOf(instalment, name).due));
}

/**
 * Status is derived from the data and asOf, never stored. First match wins:
 * PAID (nothing outstanding), UPCOMING (due after asOf), OVERDUE (due before
 * asOf), PARTIAL (due on asOf and something paid), DUE (due on asOf).
 */
export function deriveStatus(instalment: Instalment, asOf: IsoDate): InstalmentStatus {
  if (instalmentOutstanding(instalment) === 0n) return "PAID";
  const order = compareIsoDate(instalment.dueDate, asOf);
  if (order > 0) return "UPCOMING";
  if (order < 0) return "OVERDUE";
  return instalmentPaid(instalment) > 0n ? "PARTIAL" : "DUE";
}

/** Eligible for a payment: due on or before asOf, with something outstanding. */
export function isEligible(instalment: Instalment, asOf: IsoDate): boolean {
  return compareIsoDate(instalment.dueDate, asOf) <= 0 && instalmentOutstanding(instalment) > 0n;
}

/** Oldest first. Same due date falls back to instalment number. Returns a new array. */
export function sortOldestFirst(instalments: readonly Instalment[]): Instalment[] {
  return [...instalments].sort((a, b) => compareIsoDate(a.dueDate, b.dueDate) || a.number - b.number);
}

export interface LoanTotals {
  readonly outstanding: Kobo;
  /** Outstanding on instalments due on or before asOf. A payment can clear at most this. */
  readonly dueNow: Kobo;
  readonly overdue: Kobo;
  readonly paid: Kobo;
  readonly fullyPaid: boolean;
  readonly overdueCount: number;
  readonly nextDue: Instalment | undefined;
}

export function loanTotals(loan: Loan, asOf: IsoDate): LoanTotals {
  let outstanding = 0n;
  let dueNow = 0n;
  let overdue = 0n;
  let paid = 0n;
  let overdueCount = 0;
  let nextDue: Instalment | undefined;
  for (const instalment of sortOldestFirst(loan.instalments)) {
    const owed = instalmentOutstanding(instalment);
    outstanding += owed;
    paid += instalmentPaid(instalment);
    if (isEligible(instalment, asOf)) dueNow += owed;
    if (deriveStatus(instalment, asOf) === "OVERDUE") {
      overdue += owed;
      overdueCount += 1;
    }
    if (owed > 0n && nextDue === undefined && compareIsoDate(instalment.dueDate, asOf) >= 0) {
      nextDue = instalment;
    }
  }
  return {
    outstanding,
    dueNow,
    overdue,
    paid,
    fullyPaid: loan.instalments.length > 0 && outstanding === 0n,
    overdueCount,
    nextDue,
  };
}

// ---------------------------------------------------------------------------
// Fixture parsing: the boundary where server JSON becomes typed, validated data.
// ---------------------------------------------------------------------------

/** Runs a field parser and re-throws its error as a LoanDataError. */
function field<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new LoanDataError(error instanceof Error ? error.message : String(error));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new LoanDataError(`${path}.${key} must be a non-empty string`);
  }
  return value;
}

function parseComponent(value: unknown, path: string): ComponentAmounts {
  if (!isRecord(value)) {
    // A missing component (e.g. no fee on this instalment) means nothing was due.
    if (value === undefined) return { due: 0n, paid: 0n };
    throw new LoanDataError(`${path} must be an object with due and paid`);
  }
  const due = field(() => parseKoboString(value.due ?? "0", `${path}.due`));
  const paid = field(() => parseKoboString(value.paid ?? "0", `${path}.paid`));
  if (paid > due) {
    throw new LoanDataError(`${path}.paid (${paid}) is more than ${path}.due (${due})`);
  }
  return { due, paid };
}

function parseInstalment(value: unknown, path: string): Instalment {
  if (!isRecord(value)) throw new LoanDataError(`${path} must be an object`);
  const number = value.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) {
    throw new LoanDataError(`${path}.number must be a positive integer`);
  }
  return {
    number,
    dueDate: field(() => parseIsoDate(value.dueDate, `${path}.dueDate`)),
    penalty: parseComponent(value.penalty, `${path}.penalty`),
    fee: parseComponent(value.fee, `${path}.fee`),
    interest: parseComponent(value.interest, `${path}.interest`),
    principal: parseComponent(value.principal, `${path}.principal`),
  };
}

/**
 * Validates a bare array of instalments from JSON (amounts as kobo strings).
 * Useful on its own when only the schedule is available.
 */
export function parseInstalments(json: unknown, path = "instalments"): Instalment[] {
  if (!Array.isArray(json)) throw new LoanDataError(`${path} must be an array`);
  const instalments = json.map((item, index) => parseInstalment(item, `${path}[${index}]`));
  const seen = new Set<number>();
  for (const instalment of instalments) {
    if (seen.has(instalment.number)) {
      throw new LoanDataError(`instalment number ${instalment.number} appears twice`);
    }
    seen.add(instalment.number);
  }
  return instalments;
}

/** Validates server JSON into a Loan. Throws LoanDataError naming the bad field. */
export function parseLoan(json: unknown): Loan {
  if (!isRecord(json)) throw new LoanDataError("loan must be an object");
  const currency = json.currency;
  if (currency !== "NGN") {
    throw new LoanDataError(`loan.currency must be "NGN", got ${JSON.stringify(currency)}`);
  }
  const instalments = parseInstalments(json.instalments, "loan.instalments");
  const customer = json.customer;
  if (!isRecord(customer)) throw new LoanDataError("loan.customer must be an object");
  return {
    id: requireString(json, "id", "loan"),
    customerName: requireString(customer, "name", "loan.customer"),
    productName: requireString(json, "product", "loan"),
    currency,
    principal: field(() => parseKoboString(json.principal, "loan.principal")),
    interestRateLabel: requireString(json, "interestRate", "loan"),
    disbursedOn: field(() => parseIsoDate(json.disbursedOn, "loan.disbursedOn")),
    unappliedCredit: field(() => parseKoboString(json.unappliedCredit ?? "0", "loan.unappliedCredit")),
    instalments: Object.freeze(instalments.map((instalment) => Object.freeze(instalment))),
  };
}
