import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@mts/lib/utils";
import { usePortalContainer } from "@mts/lib/portal-container";

type QuickSelectState = {
  value?: string;
  disabled?: boolean;
  triggerDisabled: boolean;
  setTriggerDisabled: (disabled: boolean) => void;
  triggerId?: string;
  triggerLabel?: string;
  setTriggerId: (id?: string) => void;
  query: string;
  setQuery: (query: string) => void;
  onValueChange?: (value: string) => void;
};

const QuickSelectPresentationContext = React.createContext(false);
const QuickSelectStateContext = React.createContext<QuickSelectState | null>(null);

function optionCount(node: React.ReactNode): number {
  return React.Children.toArray(node).reduce<number>((count, child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return count;
    return count + ((child.type as { displayName?: string }).displayName === SelectPrimitive.Item.displayName ? 1 : optionCount(child.props.children));
  }, 0);
}

function nodeText(node: React.ReactNode): string {
  return React.Children.toArray(node).map((child) => React.isValidElement<{ children?: React.ReactNode }>(child) ? nodeText(child.props.children) : String(child)).join(" ");
}

function triggerProps(node: React.ReactNode): { disabled?: boolean; id?: string; "aria-label"?: string } | null {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement<{ children?: React.ReactNode; disabled?: boolean; id?: string; "aria-label"?: string }>(child)) continue;
    if ((child.type as { displayName?: string }).displayName === SelectPrimitive.Trigger.displayName) return child.props;
    const nested = triggerProps(child.props.children);
    if (nested) return nested;
  }
  return null;
}

export function SelectQuickButtonsProvider({ children }: { children: React.ReactNode }) {
  return <QuickSelectPresentationContext.Provider value>{children}</QuickSelectPresentationContext.Provider>;
}

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const quick = React.useContext(QuickSelectPresentationContext);
  const [uncontrolled, setUncontrolled] = React.useState(props.defaultValue);
  const [triggerDisabled, setTriggerDisabled] = React.useState(false);
  const [triggerId, setTriggerId] = React.useState<string>();
  const [query, setQuery] = React.useState("");
  if (!quick) return <SelectPrimitive.Root {...props} />;
  const value = props.value ?? uncontrolled;
  const declaredTrigger = triggerProps(props.children);
  return (
    <QuickSelectStateContext.Provider value={{
      value,
      disabled: props.disabled,
      triggerDisabled: Boolean(props.disabled || declaredTrigger?.disabled || triggerDisabled),
      setTriggerDisabled,
      triggerId: declaredTrigger?.id || triggerId,
      triggerLabel: declaredTrigger?.["aria-label"],
      setTriggerId,
      query,
      setQuery,
      onValueChange: (next) => {
        if (props.disabled || triggerDisabled) return;
        if (props.value === undefined) setUncontrolled(next);
        props.onValueChange?.(next);
      },
    }}>
      <div className="quote-quick-select" data-mobile-quick-select>{props.children}</div>
    </QuickSelectStateContext.Provider>
  );
}

function SelectGroup(props: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Group>) {
  const quick = React.useContext(QuickSelectPresentationContext);
  return quick ? <div className="contents">{props.children}</div> : <SelectPrimitive.Group {...props} />;
}

function SelectValue(props: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Value>) {
  const quick = React.useContext(QuickSelectPresentationContext);
  return quick ? null : <SelectPrimitive.Value {...props} />;
}

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, disabled, id, ...props }, ref) => {
  const quick = React.useContext(QuickSelectPresentationContext);
  const state = React.useContext(QuickSelectStateContext);
  const setTriggerDisabled = state?.setTriggerDisabled;
  const setTriggerId = state?.setTriggerId;
  React.useEffect(() => {
    if (!quick || !setTriggerDisabled || !setTriggerId) return;
    setTriggerDisabled(Boolean(disabled));
    setTriggerId(id);
    return () => {
      setTriggerDisabled(false);
      setTriggerId(undefined);
    };
  }, [disabled, id, quick, setTriggerDisabled, setTriggerId]);
  if (quick) return <output ref={ref as React.ForwardedRef<HTMLOutputElement>} id={id} aria-label={props["aria-label"]} aria-disabled={disabled || undefined} className="sr-only">{children}</output>;
  return (
    <SelectPrimitive.Trigger ref={ref} id={id} disabled={disabled} className={cn("flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1", className)} {...props}>
      {children}
      <SelectPrimitive.Icon asChild><ChevronDown className="h-4 w-4 opacity-50" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => {
  const quick = React.useContext(QuickSelectPresentationContext);
  return quick ? null : <SelectPrimitive.ScrollUpButton ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}><ChevronUp className="h-4 w-4" /></SelectPrimitive.ScrollUpButton>;
});
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => {
  const quick = React.useContext(QuickSelectPresentationContext);
  return quick ? null : <SelectPrimitive.ScrollDownButton ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}><ChevronDown className="h-4 w-4" /></SelectPrimitive.ScrollDownButton>;
});
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => {
  const quick = React.useContext(QuickSelectPresentationContext);
  const state = React.useContext(QuickSelectStateContext);
  const portalContainer = usePortalContainer();
  if (quick) return <div role="group" aria-label={state?.triggerLabel} aria-labelledby={state?.triggerLabel ? undefined : state?.triggerId} className={cn("flex flex-wrap gap-1.5", className)} data-mobile-quick-options>
    {optionCount(children) > 12 && <input type="search" value={state?.query || ""} onChange={(event) => state?.setQuery(event.target.value)} placeholder="Filter choices" aria-label="Filter choices" className="mb-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm" />}
    {children}
  </div>;
  return (
    <SelectPrimitive.Portal container={portalContainer ?? undefined}>
      <SelectPrimitive.Content ref={ref} className={cn("relative z-[200] max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95", position === "popper" && "data-[side=bottom]:translate-y-1", className)} position={position} {...props}>
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport className={cn("p-1", position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]")}>{children}</SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, children, ...props }, ref) => {
  const quick = React.useContext(QuickSelectPresentationContext);
  return quick ? <div className={cn("w-full py-1 text-xs font-bold", className)}>{children}</div> : <SelectPrimitive.Label ref={ref} className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props}>{children}</SelectPrimitive.Label>;
});
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, value, disabled, ...props }, ref) => {
  const quick = React.useContext(QuickSelectPresentationContext);
  const state = React.useContext(QuickSelectStateContext);
  if (quick && state) {
    const selected = state.value === value;
    const unavailable = Boolean(disabled || state.disabled || state.triggerDisabled);
    const label = `${props.textValue || ""} ${nodeText(children)}`.trim();
    if (state.query && !label.toLocaleLowerCase().includes(state.query.toLocaleLowerCase())) return null;
    return <button type="button" disabled={unavailable} aria-pressed={selected} onClick={() => state.onValueChange?.(value)} className={cn("min-h-11 rounded-lg border px-3 py-2 text-left text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40", selected ? "border-black bg-black text-white" : "border-zinc-300 bg-white text-zinc-900", className)}>{children}</button>;
  }
  return (
    <SelectPrimitive.Item ref={ref} value={value} disabled={disabled} className={cn("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground", className)} {...props}>
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="h-4 w-4" /></SelectPrimitive.ItemIndicator></span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => {
  const quick = React.useContext(QuickSelectPresentationContext);
  return quick ? <hr className={cn("w-full border-0 border-t", className)} /> : <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />;
});
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton };
