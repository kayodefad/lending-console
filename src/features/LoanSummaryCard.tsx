import { CircleAlert, CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatIsoDate } from "../domain/dates";
import { instalmentOutstanding, type Loan, type LoanTotals } from "../domain/loan";
import { formatKobo } from "../domain/money";

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  tone?: "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/40 px-4 py-3",
        tone === "danger" && "border-danger/20 bg-danger-soft",
      )}
    >
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("tabular mt-1 text-lg font-bold tracking-tight", tone === "danger" && "text-danger")}>
        {value}
        {sub ? (
          <span className="block text-xs font-medium tracking-normal text-muted-foreground">{sub}</span>
        ) : null}
      </dd>
    </div>
  );
}

export function LoanSummaryCard({ loan, totals }: { loan: Loan; totals: LoanTotals }) {
  return (
    <Card className="gap-5 px-4 sm:px-6" aria-labelledby="loan-heading" role="region">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">
            {loan.id} · {loan.productName}
          </p>
          <h1 id="loan-heading" className="text-2xl font-bold tracking-tight">
            {loan.customerName}
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="tabular">{formatKobo(loan.principal)}</span> at {loan.interestRateLabel} ·
            disbursed {formatIsoDate(loan.disbursedOn)}
          </p>
        </div>
        {totals.overdueCount > 0 ? (
          <Badge variant="danger" className="gap-1.5 px-3 py-1 text-sm">
            <CircleAlert aria-hidden="true" className="size-4!" />
            {totals.overdueCount} overdue
          </Badge>
        ) : totals.fullyPaid ? (
          <Badge variant="success" className="gap-1.5 px-3 py-1 text-sm">
            <CircleCheck aria-hidden="true" className="size-4!" />
            Fully paid
          </Badge>
        ) : null}
      </div>
      <dl className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4">
        <Stat label="Outstanding" value={formatKobo(totals.outstanding)} />
        <Stat
          label="Due now"
          value={formatKobo(totals.dueNow)}
          {...(totals.overdue > 0n ? { tone: "danger" as const } : {})}
        />
        <Stat
          label="Next instalment"
          value={totals.nextDue ? formatKobo(instalmentOutstanding(totals.nextDue)) : "None"}
          sub={totals.nextDue ? formatIsoDate(totals.nextDue.dueDate) : undefined}
        />
        <Stat label="Customer credit" value={formatKobo(loan.unappliedCredit)} />
      </dl>
    </Card>
  );
}
