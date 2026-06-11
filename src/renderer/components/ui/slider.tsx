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
            "relative rounded-full bg-[#242427] grow",
            orientation === "horizontal" ? "h-1.5 w-full" : "h-full w-1.5"
        )}>
            <SliderPrimitive.Range className={cn(
                "absolute rounded-full bg-[#FF453A]",
                orientation === "horizontal" ? "h-full" : "w-full"
            )} />
        </SliderPrimitive.Track>
        {/* Neutral thumb — no glow, subtle focus ring only */}
        <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-[#FF453A] bg-[#F5F5F7] ring-offset-[#0A0A0B] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF453A]/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
