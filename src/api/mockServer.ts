/**
 * The mocked server. It holds loans as JSON (amounts serialised as strings,
 * like the brief's fixture) and is the authority on posting: it re-runs the
 * allocation on its own copy of the loan and refuses the post if the result
 * differs from what the officer previewed. State lives in memory, so a full
 * page reload resets it.
 */
import { allocatePayment, applyAllocation } from "../domain/allocation";
import { isIsoDate, type IsoDate } from "../domain/dates";
import { buildPaymentJournal, summarizeJournal } from "../domain/journal";
import { parseKoboString } from "../domain/money";
import { componentOf, parseLoan, type Instalment, type Loan } from "../domain/loan";
import briefLoan from "./fixtures/LN-2026-0418.json";
import partPaidLoan from "./fixtures/LN-2026-0377.json";
import paidLoan from "./fixtures/LN-2026-0129.json";
import emptyLoan from "./fixtures/LN-2026-0561.json";
import notDueLoan from "./fixtures/LN-2026-0533.json";

export type Scenario = "normal" | "slow" | "error" | "flaky";
export const SCENARIOS: readonly Scenario[] = ["normal", "slow", "error", "flaky"];

export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface LoanSummary {
  readonly id: string;
  readonly customerName: string;
  readonly label: string;
}

/** Wire format of a journal line: amounts as strings, like the fixture. */
export interface JournalLineDto {
  readonly account: string;
  readonly side: "debit" | "credit";
  readonly amount: string;
}

export interface PostPaymentRequest {
  readonly loanId: string;
  readonly amountKobo: string;
  readonly asOf: string;
  /** Same key → same result, never a second posting. */
  readonly idempotencyKey: string;
  /** The journal the officer saw. The server refuses to post anything different. */
  readonly expectedLines: readonly JournalLineDto[];
}

export interface PostPaymentResponse {
  readonly entryId: string;
  readonly postedAt: string;
  readonly amountKobo: string;
  readonly lines: readonly JournalLineDto[];
  readonly loan: unknown;
}

const seed: Record<string, unknown> = {
  "LN-2026-0418": briefLoan,
  "LN-2026-0377": partPaidLoan,
  "LN-2026-0533": notDueLoan,
  "LN-2026-0129": paidLoan,
  "LN-2026-0561": emptyLoan,
};

const LABELS: Record<string, string> = {
  "LN-2026-0418": "Brief example: 2 overdue",
  "LN-2026-0377": "Part-paid, fees and penalty",
  "LN-2026-0533": "Nothing due yet",
  "LN-2026-0129": "Fully paid, with credit",
  "LN-2026-0561": "Schedule not generated",
};

let store = new Map<string, unknown>();
const postings = new Map<string, PostPaymentResponse>();
let entrySequence = 0;
/** "flaky" fails the first read and the first write, so both retry paths can be seen. */
let flakyFailuresLeft = { read: 1, write: 1 };

/** Test hook: fixed latency for every request (null restores the defaults). */
let latencyOverride: number | null = null;
export function setMockLatency(ms: number | null): void {
  latencyOverride = ms;
}

export function resetMockServer(): void {
  store = new Map(Object.entries(seed).map(([id, json]) => [id, structuredClone(json)]));
  postings.clear();
  entrySequence = 0;
  flakyFailuresLeft = { read: 1, write: 1 };
}
resetMockServer();

export interface RequestOptions {
  readonly signal?: AbortSignal | undefined;
  readonly scenario?: Scenario | undefined;
  /** Test hook: milliseconds of fake latency. */
  readonly latencyMs?: number | undefined;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function simulateNetwork(options: RequestOptions, kind: "read" | "write"): Promise<void> {
  const scenario = options.scenario ?? "normal";
  const ms = options.latencyMs ?? latencyOverride ?? (scenario === "slow" ? 2500 : 450);
  await delay(ms, options.signal);
  if (scenario === "error") {
    throw new ApiError(503, "The loan service is unavailable. Try again in a moment.");
  }
  if (scenario === "flaky" && flakyFailuresLeft[kind] > 0) {
    flakyFailuresLeft[kind] -= 1;
    throw new ApiError(503, "The loan service didn't respond. Try again.");
  }
}

export async function listLoans(options: RequestOptions = {}): Promise<LoanSummary[]> {
  await delay(options.latencyMs ?? 0, options.signal);
  return [...store.entries()].map(([id, json]) => ({
    id,
    customerName: (json as { customer: { name: string } }).customer.name,
    label: LABELS[id] ?? "",
  }));
}

export async function fetchLoan(id: string, options: RequestOptions = {}): Promise<unknown> {
  await simulateNetwork(options, "read");
  const json = store.get(id);
  if (!json) throw new ApiError(404, `Loan ${id} wasn't found.`);
  return structuredClone(json);
}

const toDto = (lines: ReturnType<typeof buildPaymentJournal>): JournalLineDto[] =>
  lines.map((line) => ({ account: line.account, side: line.side, amount: line.amount.toString() }));

function serialiseLoan(loan: Loan, original: unknown): unknown {
  const amounts = (instalment: Instalment) =>
    Object.fromEntries(
      (["penalty", "fee", "interest", "principal"] as const).map((name) => [
        name,
        {
          due: componentOf(instalment, name).due.toString(),
          paid: componentOf(instalment, name).paid.toString(),
        },
      ]),
    );
  return {
    ...(original as object),
    unappliedCredit: loan.unappliedCredit.toString(),
    instalments: loan.instalments.map((instalment) => ({
      number: instalment.number,
      dueDate: instalment.dueDate,
      ...amounts(instalment),
    })),
  };
}

export async function postPayment(
  request: PostPaymentRequest,
  options: RequestOptions = {},
): Promise<PostPaymentResponse> {
  await simulateNetwork(options, "write");

  const previous = postings.get(request.idempotencyKey);
  if (previous) return structuredClone(previous);

  const json = store.get(request.loanId);
  if (!json) throw new ApiError(404, `Loan ${request.loanId} wasn't found.`);
  if (!isIsoDate(request.asOf)) throw new ApiError(400, "asOf must be a calendar date.");

  let amount: bigint;
  try {
    amount = parseKoboString(request.amountKobo, "amountKobo");
  } catch {
    throw new ApiError(400, "The amount must be a whole number of kobo.");
  }
  if (amount <= 0n) throw new ApiError(400, "The amount must be more than zero.");

  const loan = parseLoan(json);
  const asOf: IsoDate = request.asOf;
  const result = allocatePayment(loan.instalments, amount, asOf);
  const lines = buildPaymentJournal(result);
  if (!summarizeJournal(lines).balanced) {
    throw new ApiError(500, "The journal entry doesn't balance, so nothing was posted.");
  }
  const dto = toDto(lines);
  if (JSON.stringify(dto) !== JSON.stringify(request.expectedLines)) {
    throw new ApiError(
      409,
      "The loan changed since you opened it, so the allocation is different. Review the new preview and confirm again.",
    );
  }

  const updated: Loan = {
    ...loan,
    unappliedCredit: loan.unappliedCredit + result.unapplied,
    instalments: applyAllocation(loan.instalments, result),
  };
  const updatedJson = serialiseLoan(updated, json);
  store.set(request.loanId, updatedJson);

  entrySequence += 1;
  const response: PostPaymentResponse = {
    entryId: `JE-${asOf.replaceAll("-", "")}-${entrySequence.toString().padStart(4, "0")}`,
    postedAt: new Date().toISOString(),
    amountKobo: amount.toString(),
    lines: dto,
    loan: structuredClone(updatedJson),
  };
  postings.set(request.idempotencyKey, response);
  return structuredClone(response);
}

/** Test/demo hook: change a loan behind the officer's back to show the 409 path. */
export function tamperWithLoan(id: string, mutate: (json: Record<string, unknown>) => void): void {
  const json = store.get(id);
  if (json) mutate(json as Record<string, unknown>);
}
