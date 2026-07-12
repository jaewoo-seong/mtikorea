"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/email", label: "Email", icon: "mail" },
  { href: "/companies", label: "Companies", icon: "building" },
  { href: "/admin", label: "Admin", icon: "settings" },
];

export function LeftSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[var(--layout-sidebar-width)] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-[var(--layout-topbar-height)] items-center border-b border-border px-6">
        <span className="text-lg font-bold text-text">MTI AI Platform</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors duration-150",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-text-secondary hover:bg-background hover:text-text",
              )}
            >
              <Icon name={item.icon} className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
