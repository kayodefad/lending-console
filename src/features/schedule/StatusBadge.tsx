import { CircleAlert, CircleCheck, CircleDashed, CircleDot, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { InstalmentStatus } from "../../domain/loan";

const CONFIG = {
  PAID: { label: "Paid", variant: "success", Icon: CircleCheck },
  UPCOMING: { label: "Upcoming", variant: "muted", Icon: Clock3 },
  OVERDUE: { label: "Overdue", variant: "danger", Icon: CircleAlert },
  PARTIAL: { label: "Partial", variant: "warning", Icon: CircleDashed },
  DUE: { label: "Due", variant: "info", Icon: CircleDot },
} as const;

/** Status in words with an icon, so it never relies on colour alone. */
export function StatusBadge({ status }: { status: InstalmentStatus }) {
  const { label, variant, Icon } = CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1 px-2 py-0.5 font-semibold">
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
