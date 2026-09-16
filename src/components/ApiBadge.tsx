import type { ReactNode } from "react";

interface ApiBadgeProps {
  children: ReactNode;
  tone?: "navy" | "teal" | "amber" | "muted";
}

export function ApiBadge({ children, tone = "muted" }: ApiBadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
