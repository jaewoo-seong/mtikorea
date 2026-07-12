import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type CardVariant = "elevated" | "flat" | "outline";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const variantClasses: Record<CardVariant, string> = {
  elevated: "bg-surface shadow-medium border border-transparent",
  flat: "bg-surface border border-transparent",
  outline: "bg-surface border border-border",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "elevated", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("rounded-lg p-4", variantClasses[variant], className)}
        {...props}
      />
    );
  },
);

Card.displayName = "Card";
