import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allocatePayment } from "./allocation";
import { buildPaymentJournal, summarizeJournal, type JournalLine } from "./journal";
import { briefInstalments, d, inst } from "./test-helpers";

const asOf = d("2026-11-11");

describe("buildPaymentJournal", () => {
  it("matches the brief's journal entry for ₦250,000.00", () => {
    const lines = buildPaymentJournal(allocatePayment(briefInstalments(), 25_000_000n, asOf));
    expect(lines.map((l) => [l.account, l.side, l.amount])).toEqual([
      ["Cash", "debit", 25_000_000n],
      ["Penalty Income", "credit", 50_000n],
      ["Interest Receivable", "credit", 3_311_055n],
      ["Loans Receivable", "credit", 21_638_945n],
    ]);
    expect(summarizeJournal(lines)).toEqual({
      debit: 25_000_000n,
      credit: 25_000_000n,
      balanced: true,
      difference: 0n,
      empty: false,
    });
  });

  it("leaves out zero lines and credits fees and overpayments", () => {
    const schedule = [inst(1, "2026-10-01", { fee: 300n, principal: 700n })];
    const lines = buildPaymentJournal(allocatePayment(schedule, 1_500n, asOf));
    expect(lines.map((l) => [l.account, l.accountType, l.amount])).toEqual([
      ["Cash", "Asset", 1_500n],
      ["Fee Income", "Income", 300n],
      ["Loans Receivable", "Asset", 700n],
      ["Unapplied Credit", "Liability", 500n],
    ]);
  });

  it("posts a payment with nothing due as Dr Cash / Cr Unapplied Credit", () => {
    const lines = buildPaymentJournal(
      allocatePayment([inst(1, "2026-12-01", { principal: 100n })], 40n, asOf),
    );
    expect(lines.map((l) => l.account)).toEqual(["Cash", "Unapplied Credit"]);
  });

  it("produces no lines for a zero payment: trivially balanced, flagged empty", () => {
    const lines = buildPaymentJournal(allocatePayment(briefInstalments(), 0n, asOf));
    expect(lines).toEqual([]);
    expect(summarizeJournal(lines)).toMatchObject({ balanced: true, empty: true, debit: 0n, credit: 0n });
  });

  it("always balances, for any payment (fast-check)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 12n }), (payment) => {
        const totals = summarizeJournal(
          buildPaymentJournal(allocatePayment(briefInstalments(), payment, asOf)),
        );
        expect(totals.balanced).toBe(true);
        expect(totals.debit).toBe(payment);
      }),
    );
  });
});

describe("summarizeJournal", () => {
  it("computes the balance from the lines, so a tampered entry shows as out of balance", () => {
    const lines: JournalLine[] = [
      { account: "Cash", accountType: "Asset", side: "debit", amount: 1_000n },
      { account: "Loans Receivable", accountType: "Asset", side: "credit", amount: 999n },
    ];
    expect(summarizeJournal(lines)).toEqual({
      debit: 1_000n,
      credit: 999n,
      balanced: false,
      empty: false,
      difference: 1n,
    });
  });

  it("rejects negative and non-bigint amounts", () => {
    const negative: JournalLine[] = [{ account: "Cash", accountType: "Asset", side: "debit", amount: -1n }];
    expect(() => summarizeJournal(negative)).toThrow(RangeError);
    const float = [
      { account: "Cash", accountType: "Asset", side: "debit", amount: 1.5 },
    ] as unknown as JournalLine[];
    expect(() => summarizeJournal(float)).toThrow(TypeError);
  });
});
