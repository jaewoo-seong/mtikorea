import { type ReactNode } from "react";

interface RightSidebarProps {
  title?: string;
  children: ReactNode;
}

export function RightSidebar({ title, children }: RightSidebarProps) {
  return (
    <aside className="flex h-full w-[var(--layout-right-sidebar-width)] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface">
      {title && (
        <div className="flex h-[var(--layout-topbar-height)] shrink-0 items-center border-b border-border px-6">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
        </div>
      )}
      <div className="flex-1 p-4">{children}</div>
    </aside>
  );
}
