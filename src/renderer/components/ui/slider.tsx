import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, orientation = "horizontal", ...props }, ref) => (
    <SliderPrimitive.Root
        ref={ref}
        orientation={orientation}
        className={cn(
            "relative flex touch-none select-none items-center",
            orientation === "horizontal" ? "h-2 w-full" : "h-full w-2 flex-col",
            className
        )}
        {...props}
    >
        <SliderPrimitive.Track className={cn(
            "relative rounded-full bg-[#1E3A5F] grow",
            orientation === "horizontal" ? "h-1.5 w-full" : "h-full w-1.5"
        )}>
            <SliderPrimitive.Range className={cn(
                "absolute rounded-full bg-[#29B6F6]",
                orientation === "horizontal" ? "h-full" : "w-full"
            )} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-[#29B6F6] bg-[#0A1929] ring-offset-[#0A1929] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29B6F6]/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:shadow-[0_0_8px_rgba(41,182,246,0.5)]" />
    </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
