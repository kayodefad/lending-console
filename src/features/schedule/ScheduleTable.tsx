import { useId } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AllocationResult } from "../../domain/allocation";
import { daysBetween, formatIsoDate, type IsoDate } from "../../domain/dates";
import {
  COMPONENTS,
  componentOf,
  deriveStatus,
  instalmentDue,
  instalmentOutstanding,
  instalmentPaid,
  sortOldestFirst,
  type Instalment,
} from "../../domain/loan";
import { formatKobo, sumKobo, type Kobo } from "../../domain/money";
import { StatusBadge } from "./StatusBadge";

interface ScheduleTableProps {
  readonly instalments: readonly Instalment[];
  readonly asOf: IsoDate;
  /** Live preview of the payment being typed, to show which rows it reaches. */
  readonly allocation: AllocationResult | null;
}

export function Amount({ kobo, className }: { kobo: Kobo; className?: string }) {
  return (
    <span className={cn("tabular", kobo === 0n && "text-muted-foreground", className)}>
      {formatKobo(kobo, { symbol: false })}
    </span>
  );
}

const COMPONENT_HEADERS = {
  penalty: "Penalty",
  fee: "Fee",
  interest: "Interest",
  principal: "Principal",
} as const;
const head = "h-10 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground";

export function ScheduleTable({ instalments, asOf, allocation }: ScheduleTableProps) {
  const headingId = useId();
  const rows = sortOldestFirst(instalments);
  const appliedByNumber = new Map(allocation?.allocations.map((a) => [a.number, a.appliedTotal]) ?? []);
  const total = (pick: (instalment: Instalment) => Kobo) => sumKobo(rows.map(pick));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-6">
        <div>
          <h2 id={headingId} className="text-base font-semibold">
            Repayment schedule
          </h2>
          <p className="text-[0.8125rem] text-muted-foreground">Amounts in ₦ · as of {formatIsoDate(asOf)}</p>
        </div>
        {allocation && allocation.applied > 0n ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            <span>
              Figures with a <span className="font-semibold text-primary">minus sign (−)</span> under
              Outstanding show what the payment being entered will cover.
            </span>
          </p>
        ) : null}
      </div>
      <Table
        aria-labelledby={headingId}
        className="text-[0.8125rem]"
        containerProps={{
          role: "region",
          "aria-labelledby": headingId,
          tabIndex: 0,
          className: "rounded-none focus-visible:outline-offset-[-2px]",
        }}
      >
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className={cn(head, "pl-6")}>
              #
            </TableHead>
            <TableHead scope="col" className={head}>
              Due date
            </TableHead>
            {COMPONENTS.map((name) => (
              <TableHead scope="col" key={name} className={cn(head, "text-right")}>
                {COMPONENT_HEADERS[name]}
              </TableHead>
            ))}
            <TableHead scope="col" className={cn(head, "text-right")}>
              Paid
            </TableHead>
            <TableHead scope="col" className={cn(head, "text-right")}>
              Outstanding
            </TableHead>
            <TableHead scope="col" className={cn(head, "pr-6")}>
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((instalment) => {
            const status = deriveStatus(instalment, asOf);
            const late = status === "OVERDUE" ? daysBetween(instalment.dueDate, asOf) : 0;
            const applied = appliedByNumber.get(instalment.number) ?? 0n;
            return (
              <TableRow
                key={instalment.number}
                data-status={status.toLowerCase()}
                className={cn(
                  "h-14",
                  status === "OVERDUE" && "bg-danger-soft/70 hover:bg-danger-soft",
                  status === "PAID" && "text-muted-foreground",
                )}
              >
                <TableHead
                  scope="row"
                  className={cn(
                    "relative pl-6 font-semibold text-foreground",
                    status === "OVERDUE" &&
                      "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-danger",
                    (status === "DUE" || status === "PARTIAL") &&
                      "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-info",
                  )}
                >
                  {instalment.number}
                </TableHead>
                <TableCell className="whitespace-nowrap">{formatIsoDate(instalment.dueDate)}</TableCell>
                {COMPONENTS.map((name) => (
                  <TableCell key={name} className="text-right">
                    <Amount kobo={componentOf(instalment, name).due} />
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <Amount kobo={instalmentPaid(instalment)} />
                </TableCell>
                <TableCell className="text-right font-semibold text-foreground">
                  <Amount kobo={instalmentOutstanding(instalment)} />
                  {applied > 0n ? (
                    <span className="tabular block text-xs font-bold text-primary">
                      <span className="visually-hidden">This payment covers </span>−
                      {formatKobo(applied, { symbol: false })}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="pr-6">
                  <div className="flex flex-col items-start gap-0.5">
                    <StatusBadge status={status} />
                    {late > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {late} day{late === 1 ? "" : "s"} late
                      </span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="row" colSpan={2} className="pl-6 font-semibold text-foreground">
              Total
            </TableHead>
            {COMPONENTS.map((name) => (
              <TableCell key={name} className="text-right font-semibold">
                <Amount kobo={total((i) => componentOf(i, name).due)} />
              </TableCell>
            ))}
            <TableCell className="text-right font-semibold">
              <Amount kobo={total(instalmentPaid)} />
            </TableCell>
            <TableCell className="text-right font-bold">
              <Amount kobo={total(instalmentOutstanding)} />
            </TableCell>
            <TableCell className="pr-6">
              <span className="visually-hidden">Total due {formatKobo(total(instalmentDue))}</span>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
