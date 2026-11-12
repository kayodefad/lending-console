import { assertIsoDate, type IsoDate } from "./dates";
import { assertKobo, minKobo, sumKobo, type Kobo } from "./money";
import {
  COMPONENTS,
  componentOf,
  componentOutstanding,
  instalmentOutstanding,
  isEligible,
  sortOldestFirst,
  type ComponentName,
  type Instalment,
} from "./loan";

export type ComponentKobo = Readonly<Record<ComponentName, Kobo>>;

export interface InstalmentAllocation {
  readonly number: number;
  readonly dueDate: IsoDate;
  /** Due on or before asOf with something outstanding. Only these can receive money. */
  readonly eligible: boolean;
  /** What this payment applies to each component. */
  readonly applied: ComponentKobo;
  readonly appliedTotal: Kobo;
  readonly outstandingBefore: Kobo;
  /** "Still owed" on the instalment after this payment. */
  readonly outstandingAfter: Kobo;
}

export interface AllocationProof {
  readonly payment: Kobo;
  readonly applied: Kobo;
  readonly unapplied: Kobo;
  /** applied + unapplied === payment, checked with bigint arithmetic. */
  readonly holds: boolean;
}

export interface AllocationResult {
  readonly payment: Kobo;
  readonly asOf: IsoDate;
  /** One entry per instalment, oldest first (due date, then number). */
  readonly allocations: readonly InstalmentAllocation[];
  /** Applied to each component across all instalments. Feeds the journal entry. */
  readonly appliedByComponent: ComponentKobo;
  readonly applied: Kobo;
  /** Left over after everything eligible is cleared: customer credit, a liability. */
  readonly unapplied: Kobo;
  readonly proof: AllocationProof;
}

export class AllocationError extends Error {
  override readonly name = "AllocationError";
}

const zeroComponents = (): Record<ComponentName, Kobo> => ({
  penalty: 0n,
  fee: 0n,
  interest: 0n,
  principal: 0n,
});

/**
 * Applies a payment with the repayment waterfall:
 * oldest eligible instalment first; inside each, penalty → fee → interest → principal.
 * Whatever is left after every eligible instalment is cleared is unapplied credit.
 *
 * Pure: it never mutates `instalments` and returns new objects only.
 */
export function allocatePayment(
  instalments: readonly Instalment[],
  paymentKobo: Kobo,
  asOf: IsoDate,
): AllocationResult {
  assertKobo(paymentKobo, "paymentKobo");
  assertIsoDate(asOf, "asOf");
  if (paymentKobo < 0n) {
    throw new AllocationError("A payment can't be negative.");
  }

  let remaining = paymentKobo;
  const totals = zeroComponents();

  const allocations = sortOldestFirst(instalments).map((instalment): InstalmentAllocation => {
    for (const name of COMPONENTS) {
      if (componentOutstanding(componentOf(instalment, name)) < 0n) {
        throw new AllocationError(`Instalment ${instalment.number} has more ${name} paid than due.`);
      }
    }
    const outstandingBefore = instalmentOutstanding(instalment);
    const eligible = isEligible(instalment, asOf);
    const applied = zeroComponents();
    if (eligible) {
      for (const name of COMPONENTS) {
        if (remaining === 0n) break;
        const take = minKobo(remaining, componentOutstanding(componentOf(instalment, name)));
        applied[name] = take;
        totals[name] += take;
        remaining -= take;
      }
    }
    const appliedTotal = sumKobo(COMPONENTS.map((name) => applied[name]));
    return {
      number: instalment.number,
      dueDate: instalment.dueDate,
      eligible,
      applied,
      appliedTotal,
      outstandingBefore,
      outstandingAfter: outstandingBefore - appliedTotal,
    };
  });

  const applied = sumKobo(allocations.map((allocation) => allocation.appliedTotal));
  const unapplied = remaining;
  const proof: AllocationProof = {
    payment: paymentKobo,
    applied,
    unapplied,
    holds: applied + unapplied === paymentKobo,
  };
  if (!proof.holds) {
    // Unreachable by construction; refuse to return a result that loses money.
    throw new AllocationError(`Allocation does not reconcile: ${applied} + ${unapplied} ≠ ${paymentKobo}`);
  }

  return {
    payment: paymentKobo,
    asOf,
    allocations,
    appliedByComponent: totals,
    applied,
    unapplied,
    proof,
  };
}

/** Returns new instalments with the allocation added to `paid`. Inputs are untouched. */
export function applyAllocation(instalments: readonly Instalment[], result: AllocationResult): Instalment[] {
  const byNumber = new Map(result.allocations.map((a) => [a.number, a]));
  return instalments.map((instalment) => {
    const allocation = byNumber.get(instalment.number);
    if (!allocation || allocation.appliedTotal === 0n) return instalment;
    const bump = (name: ComponentName) => ({
      due: componentOf(instalment, name).due,
      paid: componentOf(instalment, name).paid + allocation.applied[name],
    });
    return {
      ...instalment,
      penalty: bump("penalty"),
      fee: bump("fee"),
      interest: bump("interest"),
      principal: bump("principal"),
    };
  });
}
