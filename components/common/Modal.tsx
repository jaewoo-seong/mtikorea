"use client";

import { type HTMLAttributes, type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

type ModalVariant = "center" | "sidebar" | "fullscreen";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  variant?: ModalVariant;
  children: ReactNode;
}

const variantClasses: Record<ModalVariant, string> = {
  center: "items-center justify-center p-4",
  sidebar: "items-stretch justify-end",
  fullscreen: "items-stretch justify-stretch",
};

const panelVariantClasses: Record<ModalVariant, string> = {
  center: "w-full max-w-lg rounded-lg shadow-heavy animate-fade-in",
  sidebar: "h-full w-full max-w-md shadow-heavy animate-slide-in-right",
  fullscreen: "h-full w-full",
};

function ModalRoot({ open, onClose, title, variant = "center", children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={cn("fixed inset-0 z-50 flex bg-black/40", variantClasses[variant])}>
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("relative flex flex-col bg-surface", panelVariantClasses[variant])}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold text-text">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1 text-text-secondary hover:bg-background hover:text-text"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function ModalFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border px-6 py-4",
        className,
      )}
      {...props}
    />
  );
}

export const Modal = Object.assign(ModalRoot, { Footer: ModalFooter });
