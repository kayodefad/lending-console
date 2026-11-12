import { CircleCheck, CircleX } from "lucide-react";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
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
import { summarizeJournal, type JournalLine } from "../../domain/journal";
import { formatKobo } from "../../domain/money";
import { sectionTitle } from "./AllocationPreview";

interface JournalPreviewProps {
  readonly lines: readonly JournalLine[];
  readonly title?: string;
}

const head = "h-8 px-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground";

/** The entry a payment posts. Totals and the balance badge are computed from the lines shown. */
export function JournalPreview({ lines, title = "Journal entry" }: JournalPreviewProps) {
  const captionId = useId();
  const totals = summarizeJournal(lines);
  const gap = totals.difference < 0n ? -totals.difference : totals.difference;

  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={captionId} className={sectionTitle}>
          {title}
        </h3>
        <Badge
          variant={totals.balanced ? "success" : "danger-soft"}
          className="gap-1 px-2.5 py-0.5 text-xs font-semibold"
          data-testid="balance-indicator"
        >
          {totals.balanced ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}
          {totals.balanced ? "Balanced" : `Out of balance${gap !== 0n ? ` by ${formatKobo(gap)}` : ""}`}
        </Badge>
      </div>
      <Table
        aria-labelledby={captionId}
        className="text-[0.8125rem]"
        containerProps={{ role: "region", "aria-labelledby": captionId, tabIndex: 0, className: "border" }}
      >
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className={cn(head, "pl-3")}>
              Account
            </TableHead>
            <TableHead scope="col" className={cn(head, "text-right")}>
              Debit (₦)
            </TableHead>
            <TableHead scope="col" className={cn(head, "pr-3 text-right")}>
              Credit (₦)
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={`${line.side}-${line.account}`}>
              <TableHead
                scope="row"
                className={cn(
                  "h-auto py-2 pl-3 font-medium text-foreground",
                  line.side === "credit" && "pl-7",
                )}
              >
                <span className="mr-1.5 inline-block w-5 text-[0.6875rem] font-bold text-muted-foreground">
                  {line.side === "debit" ? "Dr" : "Cr"}
                </span>
                {line.account}
                <span className="block pl-[1.625rem] text-[0.6875rem] font-normal text-muted-foreground">
                  {line.accountType}
                </span>
              </TableHead>
              <TableCell className="tabular px-2 text-right">
                {line.side === "debit" ? formatKobo(line.amount, { symbol: false }) : ""}
              </TableCell>
              <TableCell className="tabular pr-3 text-right">
                {line.side === "credit" ? formatKobo(line.amount, { symbol: false }) : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="row" className="pl-3 font-semibold text-foreground">
              Total
            </TableHead>
            <TableCell className="tabular px-2 text-right font-bold">
              {formatKobo(totals.debit, { symbol: false })}
            </TableCell>
            <TableCell className="tabular pr-3 text-right font-bold">
              {formatKobo(totals.credit, { symbol: false })}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}
