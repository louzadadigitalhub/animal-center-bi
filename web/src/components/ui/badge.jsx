import { cn } from "@/lib/utils";

function Badge({ className, variant = "default", ...props }) {
  return <div className={cn("ui-badge", variant === "outline" ? "ui-badge-outline" : "ui-badge-solid", className)} {...props} />;
}

export { Badge };
