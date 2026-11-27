"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

function TooltipProvider({
  delay = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delay={delay} {...props} />;
}

const TooltipContext = React.createContext<{
  id: string;
  open: boolean;
} | null>(null);

function Tooltip({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const id = React.useId();
  const [localOpen, setLocalOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? localOpen;
  return (
    <TooltipContext.Provider value={{ id, open: open && !props.disabled }}>
      <TooltipPrimitive.Root
        {...props}
        open={controlledOpen}
        defaultOpen={defaultOpen}
        onOpenChange={(nextOpen, details) => {
          onOpenChange?.(nextOpen, details);
          if (!details.isCanceled) setLocalOpen(nextOpen);
        }}
      />
    </TooltipContext.Provider>
  );
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const context = React.useContext(TooltipContext);
  return (
    <TooltipPrimitive.Trigger
      aria-describedby={context?.open ? context.id : undefined}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  positionerClassName,
  side,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup> & {
  positionerClassName?: string;
  side?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["side"];
  sideOffset?: number;
}) {
  const context = React.useContext(TooltipContext);
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        className={cn("z-50", positionerClassName)}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          id={context?.id}
          role="tooltip"
          className={cn(
            "z-50 max-w-xs rounded-lg bg-foreground px-3 py-1.5 text-xs text-background shadow-md",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity",
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
