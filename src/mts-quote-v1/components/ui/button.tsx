import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@mts-v1/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-white text-foreground shadow-sm hover:border-primary/40 hover:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/75",
        ghost: "text-foreground hover:bg-secondary hover:text-primary",
        link: "text-primary underline-offset-4 hover:underline",
        // Dashboard inbox-style buttons, aligned to the light MTS CRM palette.
        dashboardChat:
          "rounded-md border border-sky-200 bg-sky-50 text-sky-900 font-bold shadow-sm hover:border-sky-300 hover:bg-sky-100 hover:shadow-md transition-all",
        dashboardEmail:
          "rounded-md border border-blue-200 bg-blue-50 text-blue-950 font-bold shadow-sm hover:border-blue-300 hover:bg-blue-100 hover:shadow-md transition-all",
        dashboardSms:
          "rounded-md border border-teal-200 bg-teal-50 text-teal-950 font-bold shadow-sm hover:border-teal-300 hover:bg-teal-100 hover:shadow-md transition-all",
        dashboardAlerts:
          "rounded-md border border-cyan-200 bg-cyan-50 text-cyan-950 font-bold shadow-sm hover:border-cyan-300 hover:bg-cyan-100 hover:shadow-md transition-all",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
