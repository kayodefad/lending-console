import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allocatePayment, applyAllocation, AllocationError } from "./allocation";
import {
  COMPONENTS,
  componentOf,
  deriveStatus,
  instalmentOutstanding,
  parseInstalments,
  type Instalment,
} from "./loan";
import { briefInstalments, d, deepFreeze, inst } from "./test-helpers";

const asOf = d("2026-11-11");

describe("allocatePayment: the brief's visible example", () => {
  const result = allocatePayment(deepFreeze(briefInstalments()), 25_000_000n, asOf);
  const [first, second] = result.allocations;

  it("clears instalment 1 completely", () => {
    expect(first?.applied).toEqual({
      penalty: 50_000n,
      fee: 0n,
      interest: 1_800_000n,
      principal: 19_263_026n,
    });
    expect(first?.outstandingAfter).toBe(0n);
  });

  it("puts the rest on instalment 2, interest before principal", () => {
    expect(second?.applied).toEqual({ penalty: 0n, fee: 0n, interest: 1_511_055n, principal: 2_375_919n });
    expect(second?.outstandingAfter).toBe(17_176_052n);
  });

  it("leaves no unapplied credit and proves the total", () => {
    expect(result.unapplied).toBe(0n);
    expect(result.proof).toEqual({ payment: 25_000_000n, applied: 25_000_000n, unapplied: 0n, holds: true });
  });

  it("totals each component for the journal", () => {
    expect(result.appliedByComponent).toEqual({
      penalty: 50_000n,
      fee: 0n,
      interest: 3_311_055n,
      principal: 21_638_945n,
    });
  });
});

describe("allocatePayment: waterfall rules", () => {
  it("pays penalty, then fee, then interest, then principal inside an instalment", () => {
    const schedule = [inst(1, "2026-10-01", { penalty: 100n, fee: 200n, interest: 300n, principal: 400n })];
    const pay = (kobo: bigint) => allocatePayment(schedule, kobo, asOf).allocations[0]?.applied;
    expect(pay(50n)).toEqual({ penalty: 50n, fee: 0n, interest: 0n, principal: 0n });
    expect(pay(250n)).toEqual({ penalty: 100n, fee: 150n, interest: 0n, principal: 0n });
    expect(pay(700n)).toEqual({ penalty: 100n, fee: 200n, interest: 300n, principal: 100n });
    expect(pay(1000n)).toEqual({ penalty: 100n, fee: 200n, interest: 300n, principal: 400n });
  });

  it("clears the oldest instalment before touching the next, even if the input is unsorted", () => {
    const schedule = [
      inst(2, "2026-10-31", { interest: 500n, principal: 500n }),
      inst(1, "2026-09-30", { penalty: 10n, interest: 500n, principal: 500n }),
    ];
    const result = allocatePayment(schedule, 1_200n, asOf);
    expect(result.allocations.map((a) => a.number)).toEqual([1, 2]);
    expect(result.allocations[0]?.appliedTotal).toBe(1_010n);
    expect(result.allocations[1]?.applied).toEqual({ penalty: 0n, fee: 0n, interest: 190n, principal: 0n });
  });

  it("orders instalments with the same due date by number", () => {
    const schedule = [inst(5, "2026-10-01", { principal: 100n }), inst(4, "2026-10-01", { principal: 100n })];
    const result = allocatePayment(schedule, 150n, asOf);
    expect(result.allocations.map((a) => [a.number, a.appliedTotal])).toEqual([
      [4, 100n],
      [5, 50n],
    ]);
  });

  it("treats an instalment due exactly on asOf as eligible", () => {
    const result = allocatePayment([inst(1, "2026-11-11", { principal: 100n })], 100n, asOf);
    expect(result.allocations[0]?.eligible).toBe(true);
    expect(result.unapplied).toBe(0n);
  });

  it("never touches an instalment due after asOf, even with money left", () => {
    const schedule = [inst(1, "2026-11-10", { principal: 100n }), inst(2, "2026-11-12", { principal: 100n })];
    const result = allocatePayment(schedule, 500n, asOf);
    expect(result.allocations[1]).toMatchObject({
      eligible: false,
      appliedTotal: 0n,
      outstandingAfter: 100n,
    });
    expect(result.unapplied).toBe(400n);
  });

  it("only owes what's still outstanding on part-paid components", () => {
    const schedule = [
      inst(1, "2026-10-01", {
        penalty: [100n, 100n],
        fee: [50n, 20n],
        interest: [300n, 100n],
        principal: [400n, 0n],
      }),
    ];
    const result = allocatePayment(schedule, 100n, asOf);
    expect(result.allocations[0]?.applied).toEqual({ penalty: 0n, fee: 30n, interest: 70n, principal: 0n });
    expect(result.allocations[0]?.outstandingBefore).toBe(630n);
  });

  it("skips fully paid instalments", () => {
    const schedule = [
      inst(1, "2026-09-01", { interest: [100n, 100n], principal: [900n, 900n] }),
      inst(2, "2026-10-01", { principal: 500n }),
    ];
    const result = allocatePayment(schedule, 200n, asOf);
    expect(result.allocations[0]).toMatchObject({ eligible: false, appliedTotal: 0n });
    expect(result.allocations[1]?.appliedTotal).toBe(200n);
  });

  it("turns money beyond everything due into unapplied credit", () => {
    const result = allocatePayment(briefInstalments(), 50_000_000n, asOf);
    const due = 50_000n + 1_800_000n + 19_263_026n + 1_511_055n + 19_551_971n;
    expect(result.applied).toBe(due);
    expect(result.unapplied).toBe(50_000_000n - due);
    expect(result.allocations.every((a) => a.outstandingAfter === 0n)).toBe(true);
  });

  it("makes the whole payment unapplied when nothing is due yet", () => {
    const result = allocatePayment([inst(1, "2026-12-01", { principal: 1_000n })], 300n, asOf);
    expect(result.applied).toBe(0n);
    expect(result.unapplied).toBe(300n);
  });

  it("handles an empty schedule and a zero payment", () => {
    expect(allocatePayment([], 500n, asOf)).toMatchObject({ applied: 0n, unapplied: 500n, allocations: [] });
    expect(allocatePayment(briefInstalments(), 0n, asOf)).toMatchObject({ applied: 0n, unapplied: 0n });
  });

  it("allocates a single kobo", () => {
    const result = allocatePayment(briefInstalments(), 1n, asOf);
    expect(result.allocations[0]?.applied.penalty).toBe(1n);
    expect(result.proof.holds).toBe(true);
  });

  it("rejects negative or non-bigint payments and invalid dates", () => {
    expect(() => allocatePayment([], -1n, asOf)).toThrow(AllocationError);
    // @ts-expect-error: deliberately passing a float
    expect(() => allocatePayment([], 250000.5, asOf)).toThrow(TypeError);
    expect(() => allocatePayment([], 1n, d("2026-02-30"))).toThrow(TypeError);
  });

  it("refuses an instalment with more paid than due", () => {
    expect(() => allocatePayment([inst(1, "2026-10-01", { principal: [100n, 200n] })], 1n, asOf)).toThrow(
      AllocationError,
    );
  });
});

describe("allocatePayment: instalments built by hand", () => {
  it("treats a missing component as nothing due (the brief leaves fee and penalty off instalment 2)", () => {
    const schedule = [
      {
        number: 1,
        dueDate: d("2026-09-30"),
        penalty: { due: 50_000n, paid: 0n },
        interest: { due: 1_800_000n, paid: 0n },
        principal: { due: 19_263_026n, paid: 0n },
      },
      {
        number: 2,
        dueDate: d("2026-10-31"),
        interest: { due: 1_511_055n, paid: 0n },
        principal: { due: 19_551_971n, paid: 0n },
      },
    ];
    const result = allocatePayment(schedule, 25_000_000n, asOf);
    expect(result.allocations[1]?.applied).toEqual({
      penalty: 0n,
      fee: 0n,
      interest: 1_511_055n,
      principal: 2_375_919n,
    });
    expect(result.allocations[1]?.outstandingAfter).toBe(17_176_052n);
    expect(deriveStatus(schedule[1]!, asOf)).toBe("OVERDUE");
  });

  it("refuses a single component with more paid than due, even if the instalment total looks fine", () => {
    const schedule = [inst(1, "2026-10-01", { penalty: [0n, 100n], interest: 1_000n })];
    expect(() => allocatePayment(schedule, 500n, asOf)).toThrow(/more penalty paid than due/);
  });
});

describe("parseInstalments", () => {
  it("turns a bare JSON array into instalments, with missing components as zero", () => {
    const [first] = parseInstalments([
      { number: 1, dueDate: "2026-09-30", interest: { due: "100", paid: "0" } },
    ]);
    expect(componentOf(first!, "fee")).toEqual({ due: 0n, paid: 0n });
    expect(first?.interest).toEqual({ due: 100n, paid: 0n });
  });

  it("validates like parseLoan", () => {
    expect(() =>
      parseInstalments([{ number: 1, dueDate: "2026-09-30", principal: { due: 5, paid: "0" } }]),
    ).toThrow(/as a string/);
  });
});

describe("allocatePayment: never mutates its input", () => {
  it("leaves deeply frozen input alone (a write would throw)", () => {
    const schedule = deepFreeze(briefInstalments());
    expect(() => allocatePayment(schedule, 30_000_000n, asOf)).not.toThrow();
  });

  it("leaves the input structurally identical", () => {
    const schedule = briefInstalments().reverse();
    const before = structuredClone(schedule);
    allocatePayment(schedule, 30_000_000n, asOf);
    expect(schedule).toEqual(before);
  });
});

describe("applyAllocation", () => {
  it("returns new instalments with the payment added to paid", () => {
    const schedule = deepFreeze(briefInstalments());
    const next = applyAllocation(schedule, allocatePayment(schedule, 25_000_000n, asOf));
    expect(instalmentOutstanding(next[0] as Instalment)).toBe(0n);
    expect(instalmentOutstanding(next[1] as Instalment)).toBe(17_176_052n);
    expect(next[1]?.principal).toEqual({ due: 19_551_971n, paid: 2_375_919n });
    expect(schedule[0]?.principal?.paid).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests: invariants that must hold for any schedule and payment.
// ---------------------------------------------------------------------------

const component = fc
  .tuple(fc.bigInt({ min: 0n, max: 50_000_000n }), fc.bigInt({ min: 0n, max: 100n }))
  .map(([due, percentPaid]) => ({ due, paid: (due * percentPaid) / 100n }));

const instalmentArb = fc.record({
  number: fc.integer({ min: 1, max: 1_000 }),
  dueDate: fc
    .date({
      min: new Date("2026-01-01T00:00:00Z"),
      max: new Date("2027-12-31T00:00:00Z"),
      noInvalidDate: true,
    })
    .map((date) => d(date.toISOString().slice(0, 10))),
  penalty: component,
  fee: component,
  interest: component,
  principal: component,
});

const scheduleArb = fc.uniqueArray(instalmentArb, { selector: (i) => i.number, maxLength: 12 });
const paymentArb = fc.bigInt({ min: 0n, max: 1_000_000_000n });

describe("allocatePayment: invariants (fast-check)", () => {
  it("applied + unapplied always equals the payment", () => {
    fc.assert(
      fc.property(scheduleArb, paymentArb, (schedule, payment) => {
        const result = allocatePayment(schedule, payment, asOf);
        const applied = result.allocations.reduce((sum, a) => sum + a.appliedTotal, 0n);
        expect(applied + result.unapplied).toBe(payment);
        expect(result.proof.holds).toBe(true);
      }),
    );
  });

  it("never applies more than a component owes, and never to an ineligible instalment", () => {
    fc.assert(
      fc.property(scheduleArb, paymentArb, (schedule, payment) => {
        const result = allocatePayment(schedule, payment, asOf);
        const byNumber = new Map(schedule.map((i) => [i.number, i]));
        for (const allocation of result.allocations) {
          const source = byNumber.get(allocation.number)!;
          for (const name of COMPONENTS) {
            const take = allocation.applied[name];
            expect(take >= 0n).toBe(true);
            expect(take <= componentOf(source, name).due - componentOf(source, name).paid).toBe(true);
          }
          if (!allocation.eligible) expect(allocation.appliedTotal).toBe(0n);
        }
      }),
    );
  });

  it("only leaves credit once everything eligible is cleared", () => {
    fc.assert(
      fc.property(scheduleArb, paymentArb, (schedule, payment) => {
        const result = allocatePayment(schedule, payment, asOf);
        if (result.unapplied > 0n) {
          expect(result.allocations.filter((a) => a.eligible).every((a) => a.outstandingAfter === 0n)).toBe(
            true,
          );
        }
      }),
    );
  });

  it("follows the waterfall: a later bucket only gets money once every earlier one is full", () => {
    fc.assert(
      fc.property(scheduleArb, paymentArb, (schedule, payment) => {
        const result = allocatePayment(schedule, payment, asOf);
        const byNumber = new Map(schedule.map((i) => [i.number, i]));
        // Flatten the eligible buckets in the order money should reach them.
        const buckets = result.allocations
          .filter((a) => a.eligible)
          .flatMap((a) =>
            COMPONENTS.map((name) => {
              const source = componentOf(byNumber.get(a.number)!, name);
              return { taken: a.applied[name], owed: source.due - source.paid };
            }),
          );
        let sawShortfall = false;
        for (const bucket of buckets) {
          if (sawShortfall) expect(bucket.taken).toBe(0n);
          if (bucket.taken < bucket.owed) sawShortfall = true;
        }
      }),
    );
  });

  it("never mutates the input", () => {
    fc.assert(
      fc.property(scheduleArb, paymentArb, (schedule, payment) => {
        const snapshot = structuredClone(schedule);
        allocatePayment(deepFreeze(schedule), payment, asOf);
        expect(schedule).toEqual(snapshot);
      }),
    );
  });
});
