import {
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from "react";
import { cn } from "@/lib/utils";

const fieldClasses =
  "w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-secondary transition-colors duration-150 focus:border-input-focus focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:opacity-50 disabled:cursor-not-allowed";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => {
    return <input ref={ref} type={type} className={cn(fieldClasses, className)} {...props} />;
  },
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => {
  return (
    <textarea ref={ref} rows={rows} className={cn(fieldClasses, "resize-y", className)} {...props} />
  );
});
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <select ref={ref} className={cn(fieldClasses, "cursor-pointer", className)} {...props}>
        {children}
      </select>
    );
  },
);
Select.displayName = "Select";
