import { useEffect, useId, useState } from "react";
import type { AllocationResult } from "../../domain/allocation";
import type { IsoDate } from "../../domain/dates";
import { summarizeJournal, type JournalLine } from "../../domain/journal";
import type { LoanTotals } from "../../domain/loan";
import { formatKobo, koboToInputText, parseAmountEntry, type Kobo } from "../../domain/money";
import { koboToWords } from "../../domain/words";
import { CalendarDays, CircleAlert, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatIsoDate } from "../../domain/dates";
import { MoneyInput } from "../money-input/MoneyInput";
import { AllocationPreview } from "./AllocationPreview";
import { JournalPreview } from "./JournalPreview";

export type PostState =
  | { readonly status: "idle" }
  | { readonly status: "posting" }
  | { readonly status: "error"; readonly message: string; readonly hint: string };

interface PaymentPanelProps {
  readonly amountText: string;
  readonly onAmountTextChange: (text: string) => void;
  readonly asOf: IsoDate;
  readonly totals: LoanTotals;
  readonly hasSchedule: boolean;
  readonly allocation: AllocationResult | null;
  readonly journal: readonly JournalLine[];
  readonly postState: PostState;
  readonly onConfirm: () => void;
}

/** Why Confirm is disabled, in words. null means it can be pressed. */
export function confirmBlocker(args: {
  amountText: string;
  totals: LoanTotals;
  hasSchedule: boolean;
  posting: boolean;
}): string | null {
  if (args.posting) return "Posting…";
  if (!args.hasSchedule)
    return "This loan has no repayment schedule yet, so there's nothing to collect against.";
  if (args.totals.fullyPaid) return "This loan is fully paid. There's nothing to collect.";
  const parsed = parseAmountEntry(args.amountText);
  if (parsed.kind === "empty") return "Enter the amount the customer paid.";
  if (parsed.kind === "error") return "Fix the amount above first.";
  if (parsed.kind === "ok" && parsed.kobo === 0n) return "Enter an amount greater than zero.";
  return null;
}

export function PaymentPanel({
  amountText,
  onAmountTextChange,
  asOf,
  totals,
  hasSchedule,
  allocation,
  journal,
  postState,
  onConfirm,
}: PaymentPanelProps) {
  const blockerId = useId();
  const parsed = parseAmountEntry(amountText);
  const amount: Kobo | null = parsed.kind === "ok" ? parsed.kobo : null;
  const posting = postState.status === "posting";
  const blocker = confirmBlocker({ amountText, totals, hasSchedule, posting });
  const zeroError = amount === 0n ? "Enter an amount greater than zero." : undefined;
  const closed = !hasSchedule || totals.fullyPaid;
  // The reason text is the callout for a closed loan, or the line under the button otherwise.
  const showReason = blocker !== null && !posting && !closed;
  const describedBy = closed ? blockerId : showReason ? blockerId : undefined;

  const quickFills: { label: string; kobo: Kobo }[] = [];
  if (totals.dueNow > 0n) quickFills.push({ label: "Everything due", kobo: totals.dueNow });
  if (totals.overdue > 0n && totals.overdue !== totals.dueNow)
    quickFills.push({ label: "Overdue only", kobo: totals.overdue });

  const summary = useLiveSummary(allocation, journal);

  return (
    <Card className="gap-5 px-4 sm:px-6" role="region" aria-labelledby="payment-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="payment-heading" className="text-base font-semibold">
          Record a payment
        </h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays aria-hidden="true" className="size-3.5" />
          Value date {formatIsoDate(asOf)}
        </span>
      </div>

      {closed ? (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertDescription id={blockerId} className="text-foreground">
            {!hasSchedule
              ? "This loan's schedule hasn't been generated, so payments can't be allocated yet."
              : "This loan is fully paid. No payment can be recorded against it."}
          </AlertDescription>
        </Alert>
      ) : null}

      <MoneyInput
        label="Amount received"
        value={amountText}
        disabled={closed}
        onChange={(text) => onAmountTextChange(text)}
        externalError={zeroError}
        hint={
          amount !== null && amount > 0n ? (
            <span data-testid="amount-words">{koboToWords(amount)}</span>
          ) : null
        }
      />

      {quickFills.length > 0 && !closed ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Fill in a common amount">
          {quickFills.map((fill) => (
            <Button
              key={fill.label}
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full hover:border-primary/40"
              onClick={() => onAmountTextChange(koboToInputText(fill.kobo))}
            >
              {fill.label}
              <span className="tabular font-normal text-muted-foreground">{formatKobo(fill.kobo)}</span>
            </Button>
          ))}
        </div>
      ) : null}

      {allocation ? (
        <>
          {allocation.unapplied > 0n ? (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription className="text-inherit">
                {allocation.applied === 0n
                  ? `Nothing is due as of the as-of date, so the full ${formatKobo(allocation.unapplied)} will be held as unapplied credit.`
                  : `This is ${formatKobo(allocation.unapplied)} more than what's due now (${formatKobo(allocation.applied)}). The extra will be held as unapplied credit, which the business owes the customer.`}
              </AlertDescription>
            </Alert>
          ) : null}
          <AllocationPreview result={allocation} />
          <JournalPreview lines={journal} />
        </>
      ) : null}

      <div className="grid gap-2 border-t pt-5">
        <Button
          type="button"
          size="lg"
          className="h-12 w-full text-base font-semibold disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          disabled={blocker !== null}
          aria-describedby={describedBy}
          onClick={onConfirm}
        >
          {posting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          {posting
            ? "Posting…"
            : amount !== null && amount > 0n
              ? `Confirm ${formatKobo(amount)}`
              : "Confirm payment"}
        </Button>
        {showReason ? (
          <p id={blockerId} className="text-center text-[0.8125rem] text-muted-foreground">
            {blocker}
          </p>
        ) : null}
      </div>

      {postState.status === "error" ? (
        <Alert variant="danger" role="alert">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{postState.message}</AlertTitle>
          <AlertDescription className="text-inherit opacity-80">{postState.hint}</AlertDescription>
        </Alert>
      ) : null}

      <p className="visually-hidden" aria-live="polite">
        {summary}
      </p>
    </Card>
  );
}

/** A short spoken summary for screen readers, updated once typing pauses. */
function useLiveSummary(allocation: AllocationResult | null, journal: readonly JournalLine[]): string {
  const [summary, setSummary] = useState("");
  const text = allocation
    ? `${formatKobo(allocation.applied)} applied to ${allocation.allocations.filter((a) => a.appliedTotal > 0n).length} instalment(s), ${formatKobo(allocation.unapplied)} unapplied. Journal ${summarizeJournal(journal).balanced ? "balanced" : "out of balance"}.`
    : "";
  useEffect(() => {
    const timer = setTimeout(() => setSummary(text), 700);
    return () => clearTimeout(timer);
  }, [text]);
  return summary;
}
