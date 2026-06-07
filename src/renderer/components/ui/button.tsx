import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29B6F6]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1929] disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "bg-gradient-to-r from-[#29B6F6] to-[#4FC3F7] text-[#0A1929] font-semibold hover:shadow-[0_0_20px_rgba(41,182,246,0.5)] hover:from-[#4FC3F7] hover:to-[#81D4FA] active:scale-[0.98]",
                destructive:
                    "bg-[#EF5350] text-[#E3F2FD] hover:bg-[#EF5350]/90 hover:shadow-[0_0_15px_rgba(239,83,80,0.4)]",
                outline:
                    "border border-[#1E3A5F] bg-[#0F2A44] text-[#E3F2FD] hover:bg-[#132F4C] hover:border-[#29B6F6]/50 hover:text-[#E3F2FD]",
                secondary:
                    "bg-[#132F4C] text-[#90CAF9] hover:bg-[#1E3A5F] hover:text-[#E3F2FD]",
                ghost: "text-[#90CAF9] hover:bg-[#132F4C] hover:text-[#E3F2FD]",
                link: "text-[#29B6F6] underline-offset-4 hover:underline hover:text-[#4FC3F7]",
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
