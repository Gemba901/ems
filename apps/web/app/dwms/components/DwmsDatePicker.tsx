"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import TaskCalendar from "./home/TaskCalendar";
import {
  formatOrganizationDateKey,
  getOrganizationTodayKey,
} from "../utils/organizationDate";

export default function DwmsDatePicker({
  value,
  onChange,
  timeZone,
  ariaLabel = "Instance date",
}: {
  value: string;
  onChange: (value: string) => void;
  timeZone?: string | null;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = getOrganizationTodayKey(timeZone);
  const [monthStart, setMonthStart] = useState(
    `${(value || today).slice(0, 7)}-01`,
  );
  function moveMonth(amount: number) {
    setMonthStart((current) => {
      const date = new Date(`${current}T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + amount);
      return date.toISOString().slice(0, 10);
    });
  }
  function selectDate(next: string) {
    onChange(next);
    setOpen(false);
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setMonthStart(`${(value || today).slice(0, 7)}-01`);
      }}
    >
      <PopoverTrigger
        aria-label={ariaLabel}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-info sm:rounded-full"
      >
        <span>
          {value
            ? formatOrganizationDateKey(value, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "All dates"}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        aria-label="Choose instance date"
        className="w-[340px] max-w-[calc(100vw-2rem)] p-2"
      >
        <TaskCalendar
          compact
          tasks={[]}
          monthStart={monthStart}
          todayKey={today}
          selectedDate={value || null}
          onSelectDate={selectDate}
          onOpenTask={() => {}}
          onPreviousMonth={() => moveMonth(-1)}
          onNextMonth={() => moveMonth(1)}
          onToday={() => selectDate(today)}
        />
        <Button
          variant="ghost"
          type="button"
          onClick={() => selectDate("")}
          className="mt-2 min-h-10 w-full rounded-lg text-sm font-medium text-primary hover:bg-primary focus-visible:ring-2 focus-visible:ring-primary"
        >
          All dates / Clear filter
        </Button>
      </PopoverContent>
    </Popover>
  );
}
