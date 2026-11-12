import type { AllocationResult } from "./allocation";
import { assertKobo, type Kobo } from "./money";

export type AccountType = "Asset" | "Income" | "Liability";

export const ACCOUNTS = {
  Cash: "Asset",
  "Loans Receivable": "Asset",
  "Interest Receivable": "Asset",
  "Penalty Income": "Income",
  "Fee Income": "Income",
  "Unapplied Credit": "Liability",
} as const satisfies Record<string, AccountType>;

export type AccountName = keyof typeof ACCOUNTS;

export interface JournalLine {
  readonly account: AccountName;
  readonly accountType: AccountType;
  readonly side: "debit" | "credit";
  readonly amount: Kobo;
}

export interface JournalTotals {
  readonly debit: Kobo;
  readonly credit: Kobo;
  /** Computed from the lines: total debits equal total credits. */
  readonly balanced: boolean;
  /** No lines at all (a zero payment). Balanced, but there's nothing to post. */
  readonly empty: boolean;
  /** debit − credit. Zero when balanced. */
  readonly difference: Kobo;
}

function line(account: AccountName, side: JournalLine["side"], amount: Kobo): JournalLine {
  return { account, accountType: ACCOUNTS[account], side, amount };
}

/**
 * The single entry a payment posts:
 *   Dr Cash                 total received
 *   Cr Penalty Income       penalty part
 *   Cr Fee Income           fee part
 *   Cr Interest Receivable  interest part (interest was accrued when it fell due)
 *   Cr Loans Receivable     principal part
 *   Cr Unapplied Credit     what's left over (owed back to the customer)
 * Zero-amount lines are left out.
 */
export function buildPaymentJournal(result: AllocationResult): JournalLine[] {
  const { appliedByComponent: parts } = result;
  const lines = [
    line("Cash", "debit", result.payment),
    line("Penalty Income", "credit", parts.penalty),
    line("Fee Income", "credit", parts.fee),
    line("Interest Receivable", "credit", parts.interest),
    line("Loans Receivable", "credit", parts.principal),
    line("Unapplied Credit", "credit", result.unapplied),
  ];
  return lines.filter((entry) => entry.amount !== 0n);
}

/** Totals and the balance check, computed from whatever lines it's given. */
export function summarizeJournal(lines: readonly JournalLine[]): JournalTotals {
  let debit = 0n;
  let credit = 0n;
  for (const entry of lines) {
    assertKobo(entry.amount, `${entry.account} amount`);
    if (entry.amount < 0n) {
      throw new RangeError(`${entry.account} has a negative amount; use the other side instead.`);
    }
    if (entry.side === "debit") debit += entry.amount;
    else credit += entry.amount;
  }
  return { debit, credit, balanced: debit === credit, empty: lines.length === 0, difference: debit - credit };
}
