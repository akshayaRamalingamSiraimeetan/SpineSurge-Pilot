import * as React from "react"
import { cn } from "@/lib/utils"

const Tabs = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value: string; onValueChange: (value: string) => void }
>(({ className, value, onValueChange, ...props }, ref) => (
    <div
        ref={ref}
        data-value={value}
        className={cn("w-full", className)}
        {...props}
    />
))
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "inline-flex h-10 items-center justify-center rounded-md bg-[#0A1929] p-1 text-[#90CAF9] border border-[#1E3A5F]",
            className
        )}
        {...props}
    />
))
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, onClick, ...props }, ref) => {
    // Basic context consumption via DOM traversal or Context is ideal, but for simple needs:
    // We rely on parent to pass onClick or we clone children in TabsList.
    // However, to keep it resilient without Context boilerplate in this quick file:
    // We will assume the parent Tabs handles passing state down if we used context.
    // BUT since we are doing a quick implementation, let's use a Context.

    const context = React.useContext(TabsContext);
    const isActive = context.value === value;

    return (
        <button
            ref={ref}
            type="button"
            className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-[#0A1929] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29B6F6]/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                isActive ? "bg-[#132F4C] text-[#E3F2FD] shadow-sm border border-[#29B6F6]/30" : "hover:bg-[#132F4C]/50 hover:text-[#E3F2FD]",
                className
            )}
            onClick={() => context.onValueChange(value)}
            {...props}
        />
    )
})
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    if (context.value !== value) return null;

    return (
        <div
            ref={ref}
            className={cn(
                "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                className
            )}
            {...props}
        />
    )
})
TabsContent.displayName = "TabsContent"


// Simple Context for Tabs
const TabsContext = React.createContext<{ value: string; onValueChange: (v: string) => void }>({ value: "", onValueChange: () => { } });

// Wrapper to provide context
const TabsRoot = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value: string; onValueChange: (value: string) => void }
>(({ className, value, onValueChange, children, ...props }, ref) => (
    <TabsContext.Provider value={{ value, onValueChange }}>
        <div
            ref={ref}
            data-value={value}
            className={cn(className)}
            {...props}
        >
            {children}
        </div>
    </TabsContext.Provider>
))
TabsRoot.displayName = "Tabs"

export { TabsRoot as Tabs, TabsList, TabsTrigger, TabsContent }
