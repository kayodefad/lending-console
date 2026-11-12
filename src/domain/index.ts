/** Public API of the domain layer: everything a test suite needs, with no React. */
export { parseNaira, parseNairaInput, formatKobo, type Kobo, type NairaParseResult } from "./money";
export {
  allocatePayment,
  applyAllocation,
  type AllocationResult,
  type InstalmentAllocation,
} from "./allocation";
export {
  buildPaymentJournal,
  summarizeJournal,
  ACCOUNTS,
  type JournalLine,
  type JournalTotals,
} from "./journal";
export {
  COMPONENTS,
  componentOf,
  deriveStatus,
  isEligible,
  parseInstalments,
  parseLoan,
  type ComponentAmounts,
  type Instalment,
  type InstalmentStatus,
  type Loan,
} from "./loan";
export { isIsoDate, todayIsoDate, type IsoDate } from "./dates";
export { koboToWords } from "./words";
