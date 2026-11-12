import { FlaskConical } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listLoans, SCENARIOS, type LoanSummary } from "../api/mockServer";
import type { DemoParams } from "../demoParams";

interface DemoControlsProps {
  readonly params: DemoParams;
  readonly onChange: (patch: Partial<Record<"loan" | "asOf" | "scenario", string | null>>) => void;
}

const SCENARIO_LABELS = {
  normal: "Normal",
  slow: "Slow (2.5 s)",
  error: "Always fail",
  flaky: "Fail once, then work",
} as const;

const fieldLabel = "text-xs font-semibold text-muted-foreground";

/**
 * Reviewer tools, kept apart from the officer UI: pick a fixture loan, move the
 * as-of date, and force network states. Everything is mirrored in the URL.
 */
export function DemoControls({ params, onChange }: DemoControlsProps) {
  const loanId = useId();
  const asOfId = useId();
  const scenarioId = useId();
  const [loans, setLoans] = useState<LoanSummary[]>([]);

  useEffect(() => {
    let active = true;
    void listLoans().then((list) => {
      if (active) setLoans(list);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <aside
      aria-label="Demo controls"
      className="rounded-xl border border-dashed border-input bg-card/60 px-4 py-3 sm:px-5"
    >
      <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wider text-amber-900">
          <FlaskConical aria-hidden="true" className="size-3" />
          Demo
        </span>
        Reviewer controls · not part of the officer UI
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={loanId} className={fieldLabel}>
            Loan
          </Label>
          <Select value={params.loanId} onValueChange={(value) => onChange({ loan: value })}>
            <SelectTrigger id={loanId} className="h-10 w-full min-w-0 bg-card [&>span]:truncate">
              <SelectValue placeholder={params.loanId} />
            </SelectTrigger>
            <SelectContent>
              {(loans.length > 0 ? loans : [{ id: params.loanId, customerName: "", label: "" }]).map(
                (loan) => (
                  <SelectItem key={loan.id} value={loan.id}>
                    <span className="font-medium">{loan.id}</span>
                    {loan.customerName ? (
                      <span className="text-muted-foreground">
                        {loan.customerName} · {loan.label}
                      </span>
                    ) : null}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={asOfId} className={fieldLabel}>
            As of
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={asOfId}
              type="date"
              value={params.asOf}
              onChange={(e) => onChange({ asOf: e.target.value || null })}
              className="h-10 w-full bg-card sm:w-40"
            />
            {params.asOfOverridden ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="px-1"
                onClick={() => onChange({ asOf: null })}
              >
                Today
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={scenarioId} className={fieldLabel}>
            Network
          </Label>
          <Select
            value={params.scenario}
            onValueChange={(value) => onChange({ scenario: value === "normal" ? null : value })}
          >
            <SelectTrigger id={scenarioId} className="h-10 w-full bg-card sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCENARIOS.map((scenario) => (
                <SelectItem key={scenario} value={scenario}>
                  {SCENARIO_LABELS[scenario]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </aside>
  );
}
