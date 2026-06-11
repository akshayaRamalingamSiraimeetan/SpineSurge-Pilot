import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface CheckboxProps
    extends React.InputHTMLAttributes<HTMLInputElement> {
    onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
    ({ className, onCheckedChange, ...props }, ref) => {
        return (
            <div className="relative flex items-center">
                <input
                    type="checkbox"
                    className={cn(
                        "peer h-4 w-4 shrink-0 rounded-sm border border-[#242427] ring-offset-[#0A0A0B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF453A]/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 checked:bg-[#FF453A] checked:border-[#FF453A] checked:text-white appearance-none transition-all cursor-pointer",
                        className
                    )}
                    ref={ref}
                    onChange={(e) => {
                        props.onChange?.(e)
                        onCheckedChange?.(e.target.checked)
                    }}
                    {...props}
                />
                <Check
                    className="absolute h-3 w-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 left-0.5 transition-opacity"
                    strokeWidth={4}
                />
            </div>
        )
    }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
