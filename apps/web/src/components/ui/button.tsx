import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

/** The app's base button (same variants as HRMS). AsyncButton builds on these. */
const buttonVariants = cva(
  [
    "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold",
    "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out",
    "active:translate-y-px active:shadow-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
    "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: "bg-brand-600 text-white shadow-sm hover:bg-brand-hover hover:shadow-md",
        outline: "border border-brand-500 bg-surface-0 text-brand-700 shadow-sm hover:border-brand-600 hover:bg-brand-50 hover:shadow",
        ghost: "text-surface-700 hover:bg-surface-100 active:bg-surface-200",
        secondary: "border border-surface-200 bg-transparent text-surface-700 hover:border-surface-300 hover:bg-surface-100 active:bg-surface-200",
        success: "bg-success text-white shadow-sm hover:bg-success/90 hover:shadow-md",
        warning: "bg-warning text-white shadow-sm hover:bg-warning/90 hover:shadow-md",
        destructive: "bg-error text-white shadow-sm hover:bg-error/90 hover:shadow-md",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-base",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        // Inside a <form>, a button with no type submits it — almost never what an onClick button wants.
        type={asChild ? type : (type ?? "button")}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
