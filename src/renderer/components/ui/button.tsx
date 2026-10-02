import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF453A]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0B] disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                // Primary: flat accent red, no gradient, no glow
                default:
                    "bg-[#FF453A] text-white font-semibold hover:bg-[#e03d33] active:scale-[0.98] shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.08)]",
                destructive:
                    "bg-[#FF453A] text-white hover:bg-[#e03d33] shadow-[0_1px_2px_rgba(0,0,0,.04)]",
                outline:
                    "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
                secondary:
                    "bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]",
                ghost:
                    "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                link:
                    "text-[#FF453A] underline-offset-4 hover:underline hover:text-[#e03d33]",
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
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
