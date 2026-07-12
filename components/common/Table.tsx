import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

function TableRoot({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

function Header({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-background", className)} {...props} />;
}

function Body({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}

function Row({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-background/60", className)} {...props} />;
}

function HeaderCell({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary",
        className,
      )}
      {...props}
    />
  );
}

interface CellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  editable?: boolean;
}

function Cell({ className, editable, ...props }: CellProps) {
  return <td className={cn("px-1 py-1", editable && "p-0.5", className)} {...props} />;
}

export const Table = Object.assign(TableRoot, {
  Header,
  Body,
  Row,
  HeaderCell,
  Cell,
});
