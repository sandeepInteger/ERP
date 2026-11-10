import * as React from "react";

import { cn } from "../../lib/utils.js";

// Shared by Input, Textarea and SelectField so every field has the same chrome and focus ring.
export const fieldClass =
  "w-full rounded-md border border-surface-200 bg-surface-0 px-3 text-sm shadow-sm transition-colors placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input type={type} className={cn(fieldClass, "flex h-9 py-2", className)} ref={ref} {...props} />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea className={cn(fieldClass, "min-h-20 py-2", className)} ref={ref} {...props} />
  ),
);
Textarea.displayName = "Textarea";

/** Replaces every native <select>: same children, value and onChange as the DOM element. */
const SelectField = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select className={cn(fieldClass, "h-9 cursor-pointer py-1", className)} ref={ref} {...props} />
  ),
);
SelectField.displayName = "SelectField";

export { Input, Textarea, SelectField };
