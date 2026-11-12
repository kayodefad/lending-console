import type { IsoDate } from "./dates";
import type { ComponentAmounts, Instalment } from "./loan";

export const d = (value: string) => value as IsoDate;

type Parts = Partial<Record<"penalty" | "fee" | "interest" | "principal", bigint | [bigint, bigint]>>;

const amounts = (value: bigint | [bigint, bigint] | undefined): ComponentAmounts =>
  value === undefined
    ? { due: 0n, paid: 0n }
    : Array.isArray(value)
      ? { due: value[0], paid: value[1] }
      : { due: value, paid: 0n };

/** inst(1, "2026-09-30", { penalty: 50_000n, interest: [1_800_000n, 100n] }) — a tuple is [due, paid]. */
export function inst(number: number, dueDate: string, parts: Parts = {}): Instalment {
  return {
    number,
    dueDate: d(dueDate),
    penalty: amounts(parts.penalty),
    fee: amounts(parts.fee),
    interest: amounts(parts.interest),
    principal: amounts(parts.principal),
  };
}

/** Deep-freezes test data so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** The brief's visible example: two due instalments, nothing paid. */
export const briefInstalments = (): Instalment[] => [
  inst(1, "2026-09-30", { penalty: 50_000n, interest: 1_800_000n, principal: 19_263_026n }),
  inst(2, "2026-10-31", { interest: 1_511_055n, principal: 19_551_971n }),
];
