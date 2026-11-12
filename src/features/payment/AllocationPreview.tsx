import { CircleCheck } from "lucide-react";
import { useId } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AllocationResult } from "../../domain/allocation";
import { formatIsoDate } from "../../domain/dates";
import { COMPONENTS, type ComponentName } from "../../domain/loan";
import { formatKobo } from "../../domain/money";
import { Amount } from "../schedule/ScheduleTable";

const HEADERS: Record<ComponentName, string> = {
  penalty: "Penalty",
  fee: "Fee",
  interest: "Interest",
  principal: "Principal",
};

export const sectionTitle = "text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground";
const head = "h-8 px-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground";

/** How the payment will be split: per eligible instalment, in waterfall order. */
export function AllocationPreview({ result }: { result: AllocationResult }) {
  const captionId = useId();
  const rows = result.allocations.filter((a) => a.eligible);
  // Only the components this payment reaches, so the table fits next to the input.
  const columns = COMPONENTS.filter((name) => result.appliedByComponent[name] > 0n);

  return (
    <section className="grid gap-2">
      <h3 id={captionId} className={sectionTitle}>
        Allocation
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing is due on or before the as-of date, so no instalment can take this payment.
        </p>
      ) : (
        <Table
          aria-labelledby={captionId}
          className="text-[0.8125rem]"
          containerProps={{ role: "region", "aria-labelledby": captionId, tabIndex: 0, className: "border" }}
        >
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className={cn(head, "pl-3")}>
                <abbr title="Instalment" className="no-underline">
                  Inst.
                </abbr>
              </TableHead>
              {columns.map((name) => (
                <TableHead scope="col" key={name} className={cn(head, "text-right")}>
                  {HEADERS[name]}
                </TableHead>
              ))}
              <TableHead scope="col" className={cn(head, "pr-3 text-right")}>
                Still owed
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.number} className={cn(row.appliedTotal === 0n && "text-muted-foreground")}>
                <TableHead
                  scope="row"
                  title={`Due ${formatIsoDate(row.dueDate)}`}
                  className="h-9 pl-3 font-semibold text-foreground"
                >
                  {row.number}
                </TableHead>
                {columns.map((name) => (
                  <TableCell key={name} className="px-2 text-right">
                    <Amount kobo={row.applied[name]} />
                  </TableCell>
                ))}
                <TableCell className="pr-3 text-right font-semibold">
                  {row.outstandingAfter === 0n ? (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-success">
                      <CircleCheck aria-hidden="true" className="size-3.5" />
                      Cleared
                    </span>
                  ) : (
                    <Amount kobo={row.outstandingAfter} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <dl className="grid gap-1.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Applied to instalments</dt>
          <dd className="tabular font-semibold">{formatKobo(result.applied)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Unapplied credit</dt>
          <dd className="tabular font-semibold">{formatKobo(result.unapplied)}</dd>
        </div>
        <div className="mt-1 flex justify-between gap-3 border-t pt-2">
          <dt className="font-semibold">Payment</dt>
          <dd className="tabular text-right font-bold">
            {formatKobo(result.payment)}
            <span
              className={cn("block text-xs font-medium", result.proof.holds ? "text-success" : "text-danger")}
            >
              {result.proof.holds ? "= applied + unapplied" : "≠ applied + unapplied"}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
