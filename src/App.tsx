import { CalendarX2, ChevronRight, CircleCheck, CloudOff, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, fetchLoan, postPayment, type PostPaymentResponse, type Scenario } from "./api/mockServer";
import { useLoan } from "./api/useLoan";
import { useDemoParams } from "./demoParams";
import { allocatePayment } from "./domain/allocation";
import type { IsoDate } from "./domain/dates";
import { buildPaymentJournal, ACCOUNTS, type AccountName, type JournalLine } from "./domain/journal";
import { loanTotals, type Loan } from "./domain/loan";
import { formatKobo, parseAmountEntry, parseKoboString } from "./domain/money";
import { DemoControls } from "./features/DemoControls";
import { LoanSummaryCard } from "./features/LoanSummaryCard";
import { JournalPreview } from "./features/payment/JournalPreview";
import { PaymentPanel, type PostState } from "./features/payment/PaymentPanel";
import { ScheduleTable } from "./features/schedule/ScheduleTable";

export function App() {
  const { params, update } = useDemoParams();
  const { state, retry, replaceLoan } = useLoan(params.loanId, params.scenario);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-foreground"
            >
              ₦
            </span>
            <div className="leading-tight">
              <p className="text-[0.9375rem] font-bold">Repayment console</p>
              <p className="text-xs text-muted-foreground">Loan servicing · back office</p>
            </div>
          </div>
          <nav aria-label="Breadcrumb" className="hidden text-sm text-muted-foreground sm:block">
            <ol className="flex items-center gap-1.5">
              <li>Loans</li>
              <li aria-hidden="true">
                <ChevronRight className="size-3.5" />
              </li>
              <li className="font-medium text-foreground" aria-current="page">
                Record repayment
              </li>
            </ol>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] gap-5 px-4 py-5 sm:px-6 sm:py-6">
        <DemoControls params={params} onChange={update} />

        {state.status === "loading" ? <LoadingState /> : null}
        {state.status === "error" ? <ErrorState message={state.message} onRetry={retry} /> : null}
        {state.status === "ready" ? (
          <LoanConsole
            key={`${state.loan.id}`}
            loan={state.loan}
            asOf={params.asOf}
            scenario={params.scenario}
            onPosted={(response) => replaceLoan(response.loan)}
            onLoanChanged={replaceLoan}
          />
        ) : null}
      </main>
    </div>
  );
}

const LAYOUT = "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]";
const SIDE = "grid min-w-0 gap-5 xl:sticky xl:top-[5.25rem]";

interface LoanConsoleProps {
  readonly loan: Loan;
  readonly asOf: IsoDate;
  readonly scenario: Scenario;
  readonly onPosted: (response: PostPaymentResponse) => void;
  /** The server says the loan changed: swap in its latest copy so the preview is current. */
  readonly onLoanChanged: (json: unknown) => void;
}

interface Receipt {
  readonly entryId: string;
  readonly amountKobo: bigint;
  readonly lines: JournalLine[];
}

const SAFE_TO_RETRY = "Nothing was posted. Pressing Confirm again is safe: it won't post twice.";

function LoanConsole({ loan, asOf, scenario, onPosted, onLoanChanged }: LoanConsoleProps) {
  const [amountText, setAmountText] = useState("");
  const [postState, setPostState] = useState<PostState>({ status: "idle" });
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const idempotency = useRef<{ signature: string; key: string } | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const totals = useMemo(() => loanTotals(loan, asOf), [loan, asOf]);
  const entry = parseAmountEntry(amountText);
  const amount = entry.kind === "ok" ? entry.kobo : null;
  const allocation = useMemo(
    () => (amount !== null && amount > 0n ? allocatePayment(loan.instalments, amount, asOf) : null),
    [loan.instalments, amount, asOf],
  );
  const journal = useMemo(() => (allocation ? buildPaymentJournal(allocation) : []), [allocation]);

  useEffect(() => {
    if (receipt) receiptRef.current?.focus();
  }, [receipt]);

  const handleAmountChange = (text: string) => {
    setAmountText(text);
    if (postState.status === "error") setPostState({ status: "idle" });
  };

  const handleConfirm = async () => {
    if (!allocation || amount === null || postState.status === "posting") return;
    const expectedLines = journal.map((line) => ({
      account: line.account,
      side: line.side,
      amount: line.amount.toString(),
    }));
    // Same loan, amount and date → same key, so a retry after a timeout can't post twice.
    const signature = `${loan.id}|${amount}|${asOf}|${JSON.stringify(expectedLines)}`;
    if (idempotency.current?.signature !== signature) {
      idempotency.current = { signature, key: crypto.randomUUID() };
    }
    setPostState({ status: "posting" });
    try {
      const response = await postPayment(
        {
          loanId: loan.id,
          amountKobo: amount.toString(),
          asOf,
          idempotencyKey: idempotency.current.key,
          expectedLines,
        },
        { scenario },
      );
      idempotency.current = null;
      setReceipt({
        entryId: response.entryId,
        amountKobo: parseKoboString(response.amountKobo, "amountKobo"),
        lines: response.lines.map((line) => {
          const account = line.account as AccountName;
          return {
            account,
            accountType: ACCOUNTS[account],
            side: line.side,
            amount: parseKoboString(line.amount, `${line.account} amount`),
          };
        }),
      });
      setAmountText("");
      setPostState({ status: "idle" });
      onPosted(response);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "The payment couldn't be posted.";
      if (error instanceof ApiError && error.status === 409) {
        // The loan moved on (another payment landed). Load the server's copy so the
        // preview recomputes, and let the officer review it before confirming again.
        try {
          onLoanChanged(await fetchLoan(loan.id, { scenario }));
          setPostState({
            status: "error",
            message,
            hint: "The preview now shows the latest figures. Nothing was posted.",
          });
        } catch {
          setPostState({
            status: "error",
            message,
            hint: "Reload the loan before trying again. Nothing was posted.",
          });
        }
        return;
      }
      setPostState({ status: "error", message, hint: SAFE_TO_RETRY });
    }
  };

  return (
    <>
      {receipt ? (
        <Alert
          variant="success"
          ref={receiptRef}
          tabIndex={-1}
          role="status"
          className="gap-y-2 outline-none"
        >
          <CircleCheck aria-hidden="true" />
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <p>
              <strong className="tabular">{formatKobo(receipt.amountKobo)} posted</strong> as journal entry{" "}
              <code className="rounded bg-card px-1.5 py-0.5 font-mono text-xs">{receipt.entryId}</code>. The
              schedule below is updated.
            </p>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => setReceipt(null)}
            >
              Dismiss
            </Button>
          </div>
          <details className="col-start-2 group">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Show posted entry</summary>
            <div className="mt-3 rounded-lg bg-card p-3">
              <JournalPreview lines={receipt.lines} title={`Posted entry ${receipt.entryId}`} />
            </div>
          </details>
        </Alert>
      ) : null}

      <div className={LAYOUT}>
        <div className="grid min-w-0 gap-5">
          <LoanSummaryCard loan={loan} totals={totals} />
          <Card className="gap-0 overflow-hidden py-5">
            {loan.instalments.length === 0 ? (
              <div className="grid justify-items-center gap-2 px-6 py-10 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-muted">
                  <CalendarX2 aria-hidden="true" className="size-6 text-muted-foreground" />
                </span>
                <p className="text-base font-semibold">No repayment schedule yet</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  This loan was booked on the server but its schedule hasn't been generated. Once it is,
                  instalments will appear here.
                </p>
              </div>
            ) : (
              <ScheduleTable instalments={loan.instalments} asOf={asOf} allocation={allocation} />
            )}
          </Card>
        </div>
        <div className={SIDE}>
          <PaymentPanel
            amountText={amountText}
            onAmountTextChange={handleAmountChange}
            asOf={asOf}
            totals={totals}
            hasSchedule={loan.instalments.length > 0}
            allocation={allocation}
            journal={journal}
            postState={postState}
            onConfirm={() => void handleConfirm()}
          />
        </div>
      </div>
    </>
  );
}

function LoadingState() {
  return (
    <div className={LAYOUT} aria-busy="true">
      <div className="grid min-w-0 gap-5">
        <Card className="gap-4 px-6">
          <p className="visually-hidden" role="status">
            Loading loan…
          </p>
          <div className="skeleton h-4 w-48" />
          <div className="skeleton h-7 w-64" />
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[72px]" />
            ))}
          </div>
        </Card>
        <Card className="px-6">
          <div className="skeleton h-80" />
        </Card>
      </div>
      <div className={SIDE}>
        <Card className="gap-4 px-6">
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-14" />
          <div className="skeleton h-12" />
        </Card>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => buttonRef.current?.focus(), []);
  return (
    <Card role="alert" className="items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-danger-soft">
        <CloudOff aria-hidden="true" className="size-6 text-danger" />
      </span>
      <p className="text-base font-semibold">Couldn't load this loan</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button ref={buttonRef} type="button" variant="outline" className="mt-2 h-10" onClick={onRetry}>
        <RotateCw aria-hidden="true" />
        Try again
      </Button>
    </Card>
  );
}
