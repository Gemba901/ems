"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/patterns/PageHeader";
import { useState, type FormEvent } from "react";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";
import {
  useCreateHoliday,
  useDeleteHoliday,
  useHolidayCountries,
  useHolidays,
  useImportHolidays,
  useLocationSettings,
  useUpdateHoliday,
  useUpdateWorkSettings,
  useWorkSettings,
} from "@/hooks/work/useWork";
import { formatDateOnly, formatMinutes, WEEKDAY_LABELS } from "@/lib/work/format";
import type { Holiday, WorkSettings } from "@/services/work.service";
import { ArrangementList } from "@/components/work/locations/ArrangementList";
import { CompanyLocations } from "@/components/work/locations/CompanyLocations";
import { HomeRequestQueue } from "@/components/work/locations/HomeRequestQueue";
import { EmptyState, ErrorNote, Field, HelpTip, Loading, Surface, errorMessage } from "@/components/work/ui";

// Monday first, as most teams read a working week.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Draft = Pick<
  WorkSettings,
  "workStartTime" | "workEndTime" | "lateGraceMinutes" | "lunchBreakEnabled" | "lunchStartTime" | "lunchEndTime" | "holidayCountry" | "observeOnNextWorkingDay" | "workingDays"
>;

function toDraft(s: WorkSettings): Draft {
  return {
    workStartTime: s.workStartTime,
    workEndTime: s.workEndTime,
    lateGraceMinutes: s.lateGraceMinutes,
    lunchBreakEnabled: s.lunchBreakEnabled,
    lunchStartTime: s.lunchStartTime,
    lunchEndTime: s.lunchEndTime,
    holidayCountry: s.holidayCountry,
    observeOnNextWorkingDay: s.observeOnNextWorkingDay,
    workingDays: s.workingDays,
  };
}

function ScheduleForm({ settings }: { settings: WorkSettings }) {
  const update = useUpdateWorkSettings();
  const countries = useHolidayCountries();
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [saved, setSaved] = useState(false);
  const readOnly = !settings.canEdit;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  function toggleDay(day: number) {
    set("workingDays", draft.workingDays.includes(day) ? draft.workingDays.filter((d) => d !== day) : [...draft.workingDays, day].sort());
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (readOnly || update.isPending) return;
    const payload = {
      ...draft,
      lunchStartTime: draft.lunchBreakEnabled ? draft.lunchStartTime || "13:00" : draft.lunchStartTime,
      lunchEndTime: draft.lunchBreakEnabled ? draft.lunchEndTime || "14:00" : draft.lunchEndTime,
    };
    update.mutate(payload, { onSuccess: () => setSaved(true) });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Surface className="space-y-5 p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Work hours</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One schedule for the whole organisation, in {settings.timeZone}. Punctuality is measured against the hours in force when
            someone clocks in, so changing them never rewrites past days.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starts at" htmlFor="work-start">
            <Input id="work-start" type="time" required disabled={readOnly} value={draft.workStartTime} onChange={(e) => set("workStartTime", e.target.value)} />
          </Field>
          <Field label="Ends at" htmlFor="work-end" hint="Open attendance sessions are automatically closed 30 minutes after this time, with an in-app notification. The finish time saved at clock-in applies to that session.">
            <Input id="work-end" type="time" required disabled={readOnly} value={draft.workEndTime} onChange={(e) => set("workEndTime", e.target.value)} />
          </Field>
          <Field label="Grace period (minutes)" htmlFor="work-grace" hint="Clock-ins within this window still count as on time.">
            <Input
              id="work-grace"
              type="number"
              min={0}
              max={240}
              required
              disabled={readOnly}
              value={draft.lateGraceMinutes}
              onChange={(e) => set("lateGraceMinutes", Number(e.target.value))}
            />
          </Field>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Input type="checkbox" className="h-4 w-4 rounded border-border" disabled={readOnly} checked={draft.lunchBreakEnabled} onChange={(e) => set("lunchBreakEnabled", e.target.checked)} />
            Lunch break
          </label>
          {draft.lunchBreakEnabled && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Lunch starts" htmlFor="lunch-start">
                <Input id="lunch-start" type="time" required disabled={readOnly} value={draft.lunchStartTime ?? ""} onChange={(e) => set("lunchStartTime", e.target.value)} />
              </Field>
              <Field label="Lunch ends" htmlFor="lunch-end">
                <Input id="lunch-end" type="time" required disabled={readOnly} value={draft.lunchEndTime ?? ""} onChange={(e) => set("lunchEndTime", e.target.value)} />
              </Field>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Scheduled time per day: {formatMinutes(settings.scheduledMinutesPerDay)} (as last saved).</p>
        </div>

        <fieldset className="space-y-2 border-t border-border pt-4">
          <legend className="text-sm font-medium text-foreground">Working days</legend>
          <div className="flex flex-wrap gap-2">
            {WEEK_ORDER.map((day) => {
              const on = draft.workingDays.includes(day);
              return (
                <label
                  key={day}
                  className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${on ? "border-info bg-info-subtle text-info" : "border-border bg-card text-muted-foreground"}`}
                >
                  <Input type="checkbox" className="h-4 w-4 rounded border-border" disabled={readOnly} checked={on} onChange={() => toggleDay(day)} />
                  {WEEKDAY_LABELS[day]}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Shared with Leave, so leave day counts use the same week.</p>
        </fieldset>
      </Surface>

      <Surface className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Public holidays</h2>
          <p className="mt-1 text-sm text-muted-foreground">Holidays are days off: nobody is expected to clock in.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Holiday calendar" htmlFor="holiday-country">
            <NativeSelect
              id="holiday-country"
              disabled={readOnly}
              value={draft.holidayCountry ?? ""}
              onChange={(e) => set("holidayCountry", e.target.value || null)}
            >
              <option value="">None</option>
              {(countries.data ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <Input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border"
            disabled={readOnly}
            checked={draft.observeOnNextWorkingDay}
            onChange={(e) => set("observeOnNextWorkingDay", e.target.checked)}
          />
          <span>
            <span className="font-medium">Give a day off when a holiday falls on a non-working day</span>
            <span className="block text-xs text-muted-foreground">The next free working day becomes the holiday instead.</span>
          </span>
        </label>
      </Surface>

      {update.isError && <ErrorNote>{errorMessage(update.error, "Could not save the settings.")}</ErrorNote>}
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button variant="default" type="submit" disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save settings
          </Button>
          {saved && <span className="text-sm text-success" role="status">Saved</span>}
        </div>
      )}
    </form>
  );
}

function HolidayRow({ holiday, readOnly }: { holiday: Holiday; readOnly: boolean }) {
  const update = useUpdateHoliday();
  const remove = useDeleteHoliday();
  const error = update.error ?? remove.error;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${holiday.isActive ? "text-foreground" : "text-muted-foreground line-through"}`}>{holiday.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatDateOnly(holiday.date, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
          {holiday.source === "PUBLIC" ? "Public holiday" : "Company holiday"}
        </p>
        {error && <p className="mt-1 text-xs font-medium text-danger">{errorMessage(error)}</p>}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={holiday.isActive}
              disabled={update.isPending}
              onChange={(e) => update.mutate({ holidayId: holiday.id, data: { isActive: e.target.checked } })}
            />
            Day off
          </label>
          {holiday.source === "COMPANY" && (
            <Button
              variant="ghost"
              type="button"
              aria-label={`Delete ${holiday.name}`}
              className="rounded-lg p-2 text-muted-foreground hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
              disabled={remove.isPending}
              onClick={() => remove.mutate(holiday.id)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function AddHoliday({ year }: { year: number }) {
  const create = useCreateHoliday();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { date, name: name.trim() },
      {
        onSuccess: () => {
          setDate("");
          setName("");
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border p-4">
      <p className="text-sm font-medium text-foreground">Add a company holiday</p>
      <div className="flex flex-wrap items-end gap-2">
        <Input aria-label="Date" type="date" required className="sm:w-44" min={`${year}-01-01`} max={`${year}-12-31`} value={date} onChange={(e) => setDate(e.target.value)} />
        <Input aria-label="Name" required maxLength={120} placeholder="e.g. Company retreat" className="sm:w-64" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="outline" type="submit" disabled={create.isPending}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </Button>
      </div>
      {create.isError && <p className="text-xs font-medium text-danger">{errorMessage(create.error)}</p>}
    </form>
  );
}

function HolidayCalendar({ readOnly, hasCountry }: { readOnly: boolean; hasCountry: boolean }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const holidays = useHolidays(year);
  const importHolidays = useImportHolidays();

  return (
    <Surface>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Holiday calendar</h2>
          <HelpTip label="About the holiday calendar">
            Public holidays come from the calendar chosen above. You can switch one off if your organisation works that day, and add
            your own company holidays.
          </HelpTip>
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect aria-label="Year" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[-1, 0, 1].map((offset) => {
              const y = new Date().getFullYear() + offset;
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              );
            })}
          </NativeSelect>
          {!readOnly && hasCountry && (
            <Button variant="outline" type="button"  disabled={importHolidays.isPending} onClick={() => importHolidays.mutate(year)}>
              {importHolidays.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              Load public holidays
            </Button>
          )}
        </div>
      </div>
      {importHolidays.isError && (
        <div className="p-4">
          <ErrorNote>{errorMessage(importHolidays.error)}</ErrorNote>
        </div>
      )}
      {importHolidays.isSuccess && (
        <p className="px-4 pt-3 text-sm text-muted-foreground" role="status">
          {importHolidays.data.added === 0 ? "Already up to date." : `Added ${importHolidays.data.added} public holidays.`}
        </p>
      )}
      {holidays.isPending ? (
        <Loading />
      ) : holidays.isError ? (
        <div className="p-4">
          <ErrorNote>{errorMessage(holidays.error, "Could not load holidays.")}</ErrorNote>
        </div>
      ) : holidays.data.items.length === 0 ? (
        <div className="p-4">
          <EmptyState title={`No holidays for ${year}`}>
            {hasCountry ? "Load the public holidays for this year, or add a company holiday." : "Choose a holiday calendar above, or add a company holiday."}
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {holidays.data.items.map((h) => (
            <HolidayRow key={h.id} holiday={h} readOnly={readOnly} />
          ))}
        </ul>
      )}
      {holidays.data && holidays.data.observedDays.length > 0 && (
        <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Extra days off</p>
          <ul className="mt-1 space-y-0.5">
            {holidays.data.observedDays.map((d) => (
              <li key={d.date}>
                {formatDateOnly(d.date, { weekday: "short", day: "numeric", month: "short" })} — {d.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!readOnly && <AddHoliday year={year} />}
    </Surface>
  );
}

function LocationSettingsSection() {
  const locations = useLocationSettings();
  if (locations.isPending) return <Loading label="Loading locations…" />;
  if (locations.isError) return <ErrorNote>{errorMessage(locations.error, "Could not load company locations.")}</ErrorNote>;
  return (
    <section aria-labelledby="locations-heading" className="space-y-4">
      <div>
        <h2 id="locations-heading" className="text-lg font-semibold text-foreground">
          Clock-in locations
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each clock-in is compared with where that person is expected to work. Clock-ins elsewhere are allowed but marked
          &ldquo;Outside approved locations&rdquo;. Phone locations can drift or be faked, so treat a mark as a question, not proof.
        </p>
      </div>
      <CompanyLocations settings={locations.data} />
      {locations.data.canEdit && (
        <>
          <HomeRequestQueue />
          <ArrangementList />
        </>
      )}
    </section>
  );
}

export default function WorkSettingsPage() {
  const settings = useWorkSettings();
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Work hours, lunch break, working days, holidays and clock-in locations for attendance and punctuality." />
      {settings.isPending ? (
        <Loading />
      ) : settings.isError ? (
        <ErrorNote>{errorMessage(settings.error, "Could not load the settings.")}</ErrorNote>
      ) : (
        <>
          {!settings.data.canEdit && <p className="text-sm text-muted-foreground">Only administrators and HR can change these settings.</p>}
          <ScheduleForm settings={settings.data} />
          <HolidayCalendar readOnly={!settings.data.canEdit} hasCountry={Boolean(settings.data.holidayCountry)} />
          <LocationSettingsSection />
        </>
      )}
    </div>
  );
}
