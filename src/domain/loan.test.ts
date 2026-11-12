import { describe, expect, it } from "vitest";
import { daysBetween, formatIsoDate, isIsoDate, todayIsoDate } from "./dates";
import { deriveStatus, loanTotals, LoanDataError, parseLoan } from "./loan";
import briefLoanJson from "../api/fixtures/LN-2026-0418.json";
import partPaidJson from "../api/fixtures/LN-2026-0377.json";
import paidJson from "../api/fixtures/LN-2026-0129.json";
import emptyJson from "../api/fixtures/LN-2026-0561.json";
import { d, inst } from "./test-helpers";

describe("deriveStatus (first match wins)", () => {
  const asOf = d("2026-11-11");

  it("PAID when nothing is outstanding, whatever the date", () => {
    expect(deriveStatus(inst(1, "2026-12-01", { principal: [100n, 100n] }), asOf)).toBe("PAID");
    expect(deriveStatus(inst(1, "2026-01-01", { principal: [100n, 100n] }), asOf)).toBe("PAID");
    expect(deriveStatus(inst(1, "2026-11-11"), asOf)).toBe("PAID");
  });

  it("UPCOMING when due after asOf, even if part-paid", () => {
    expect(deriveStatus(inst(1, "2026-11-12", { principal: 100n }), asOf)).toBe("UPCOMING");
    expect(deriveStatus(inst(1, "2026-11-12", { principal: [100n, 50n] }), asOf)).toBe("UPCOMING");
  });

  it("OVERDUE when due before asOf, even if part-paid", () => {
    expect(deriveStatus(inst(1, "2026-11-10", { principal: 100n }), asOf)).toBe("OVERDUE");
    expect(deriveStatus(inst(1, "2026-11-10", { principal: [100n, 50n] }), asOf)).toBe("OVERDUE");
  });

  it("PARTIAL when due on asOf and something is paid", () => {
    expect(deriveStatus(inst(1, "2026-11-11", { interest: [100n, 1n], principal: 100n }), asOf)).toBe(
      "PARTIAL",
    );
  });

  it("DUE when due on asOf and nothing is paid", () => {
    expect(deriveStatus(inst(1, "2026-11-11", { principal: 100n }), asOf)).toBe("DUE");
  });
});

describe("parseLoan", () => {
  it("parses the brief's loan with exact bigint amounts", () => {
    const loan = parseLoan(briefLoanJson);
    expect(loan.instalments).toHaveLength(6);
    expect(loan.instalments[0]?.principal).toEqual({ due: 19_263_026n, paid: 0n });
    expect(loan.instalments[1]?.interest).toEqual({ due: 1_511_055n, paid: 0n });
  });

  it("parses every fixture", () => {
    for (const json of [briefLoanJson, partPaidJson, paidJson, emptyJson]) {
      expect(() => parseLoan(json)).not.toThrow();
    }
  });

  const withFirstInstalment = (patch: Record<string, unknown>) => ({
    ...briefLoanJson,
    instalments: [{ ...briefLoanJson.instalments[0], ...patch }],
  });

  it.each([
    ["a number instead of a string", { principal: { due: 19263026, paid: "0" } }, /as a string/],
    ["a decimal string", { principal: { due: "192630.26", paid: "0" } }, /integer kobo/],
    ["a negative amount", { principal: { due: "-1", paid: "0" } }, /non-negative/],
    ["paid more than due", { principal: { due: "100", paid: "101" } }, /more than/],
    ["an impossible date", { dueDate: "2026-02-30" }, /calendar date/],
    ["a date with a time", { dueDate: "2026-09-30T00:00:00Z" }, /calendar date/],
    ["a bad instalment number", { number: 0 }, /positive integer/],
  ])("rejects %s", (_label, patch, message) => {
    expect(() => parseLoan(withFirstInstalment(patch))).toThrow(LoanDataError);
    expect(() => parseLoan(withFirstInstalment(patch))).toThrow(message);
  });

  it("rejects duplicate instalment numbers and other currencies", () => {
    const first = briefLoanJson.instalments[0];
    expect(() => parseLoan({ ...briefLoanJson, instalments: [first, first] })).toThrow(/appears twice/);
    expect(() => parseLoan({ ...briefLoanJson, currency: "USD" })).toThrow(/NGN/);
  });

  it("returns frozen instalments so the UI can't edit them in place", () => {
    const loan = parseLoan(briefLoanJson);
    expect(Object.isFrozen(loan.instalments)).toBe(true);
    expect(Object.isFrozen(loan.instalments[0])).toBe(true);
  });
});

describe("loanTotals", () => {
  it("summarises the brief's loan as of 11 Nov 2026", () => {
    const totals = loanTotals(parseLoan(briefLoanJson), d("2026-11-11"));
    expect(totals.dueNow).toBe(50_000n + 21_063_026n * 2n);
    expect(totals.overdue).toBe(totals.dueNow);
    expect(totals.overdueCount).toBe(2);
    expect(totals.nextDue?.number).toBe(3);
    expect(totals.fullyPaid).toBe(false);
  });

  it("flags a fully paid loan, but never an empty schedule", () => {
    expect(loanTotals(parseLoan(paidJson), d("2026-11-11")).fullyPaid).toBe(true);
    expect(loanTotals(parseLoan(emptyJson), d("2026-11-11")).fullyPaid).toBe(false);
  });
});

describe("dates", () => {
  it("validates calendar dates, including leap years", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-9-30")).toBe(false);
  });

  it("formats without going through Date, so no zone can shift the day", () => {
    expect(formatIsoDate(d("2026-09-30"))).toBe("30 Sep 2026");
    expect(formatIsoDate(d("2027-01-01"))).toBe("1 Jan 2027");
  });

  it("uses the local calendar day for today", () => {
    // 23:30 local on 11 Nov is still 11 Nov, even where UTC has rolled over.
    expect(todayIsoDate(new Date(2026, 10, 11, 23, 30))).toBe("2026-11-11");
    expect(todayIsoDate(new Date(2026, 10, 11, 0, 5))).toBe("2026-11-11");
  });

  it("counts days across month ends and DST changes", () => {
    expect(daysBetween(d("2026-09-30"), d("2026-11-11"))).toBe(42);
    expect(daysBetween(d("2026-03-28"), d("2026-03-30"))).toBe(2);
  });
});
