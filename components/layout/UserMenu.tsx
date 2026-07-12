"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Avatar } from "@/components/common/Avatar";
import { cn } from "@/lib/utils";

interface UserMenuProps {
  name: string;
  email: string;
  image?: string | null;
}

export function UserMenu({ name, email, image }: UserMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full transition-colors duration-150 hover:opacity-80"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar src={image} name={name} size="sm" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className={cn(
              "absolute right-0 z-20 mt-2 w-56 rounded-lg border border-border bg-surface p-1 shadow-medium animate-fade-in",
            )}
          >
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold text-text">{name}</p>
              <p className="truncate text-xs text-text-secondary">{email}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full rounded px-3 py-2 text-left text-sm text-text hover:bg-background"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
