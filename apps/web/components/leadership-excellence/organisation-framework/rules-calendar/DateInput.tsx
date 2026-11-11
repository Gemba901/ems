"use client";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { validCycleDate } from "./cycle-dates";
import { dateEntry, parseDateEntry } from "./calendar-editor";

/** Named months avoid locale-dependent 01/02 ambiguity. The native picker is optional. */
export function DateInput({
  value,
  onChange,
  disabled,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(dateEntry(value));
  const ownChange = useRef<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ownChange.current !== value) setText(dateEntry(value));
    ownChange.current = null;
  }, [value]);
  return (
    <span className="relative flex items-center gap-1">
      <Input
        {...props}
        disabled={disabled}
        value={text}
        placeholder="1 Jan 2027"
        onChange={(e) => {
          setText(e.target.value);
          const next = parseDateEntry(e.target.value) ?? e.target.value;
          ownChange.current = next;
          onChange(next);
        }}
        onBlur={(e) => {
          if (validCycleDate(value)) setText(dateEntry(value));
          props.onBlur?.(e);
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        disabled={disabled}
        aria-label={`Choose ${props["aria-label"] ?? "date"} from calendar`}
        onClick={() => {
          try {
            picker.current?.showPicker();
          } catch {
            /* Text entry remains usable. */
          }
        }}
      >
        <CalendarDays aria-hidden="true" />
      </Button>
      <input
        ref={picker}
        type="date"
        min={props.min}
        max={props.max}
        aria-hidden="true"
        tabIndex={-1}
        disabled={disabled}
        value={validCycleDate(value) ? value : ""}
        className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
        onChange={(e) => {
          setText(dateEntry(e.target.value));
          onChange(e.target.value);
        }}
      />
    </span>
  );
}
