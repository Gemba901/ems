"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck } from "lucide-react";
import type { DwmsRecurringSchedule } from "@/services/dwms.service";

export type GuidedFormStep = {
  id: string;
  title: string;
  complete: boolean;
  optional?: boolean;
};

type FormGuide = {
  steps: GuidedFormStep[];
  active: string;
  prefix: string;
  navigate: (id: string) => void;
};

const GuideContext = createContext<FormGuide | null>(null);

export function isRecurringScheduleReady(
  schedule: DwmsRecurringSchedule,
  today: string,
) {
  const parsed = new Date(`${schedule.startsOn}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === schedule.startsOn &&
    schedule.startsOn >= today &&
    Number.isInteger(schedule.interval) &&
    schedule.interval >= 1 &&
    schedule.interval <= 99 &&
    (schedule.unit !== "WEEK" || Boolean(schedule.weekdays?.length)) &&
    (schedule.unit !== "MONTH" ||
      (Number.isInteger(schedule.dayOfMonth) &&
        schedule.dayOfMonth! >= 1 &&
        schedule.dayOfMonth! <= 31))
  );
}

export function GuidedForm({
  title,
  description,
  steps,
  children,
  onStepChange,
}: {
  title: string;
  description: string;
  steps: GuidedFormStep[];
  children: React.ReactNode;
  onStepChange?: (id: string) => void;
}) {
  const prefix = useId();
  const [active, setActive] = useState(steps[0].id);
  const [furthest, setFurthest] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const focusRequested = useRef(false);
  const activeIndex = steps.findIndex((step) => step.id === active);

  function navigate(id: string) {
    const index = steps.findIndex((step) => step.id === id);
    if (
      index < 0 ||
      (index > activeIndex &&
        !steps.slice(0, index).every((step) => step.complete))
    )
      return;
    focusRequested.current = id !== active;
    setFurthest((previous) => Math.max(previous, index));
    setActive(id);
    onStepChange?.(id);
  }

  useEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    const section = container.current?.querySelector<HTMLElement>(
      `[data-guide-section="${active}"]`,
    );
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    section?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
    section?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  }, [active]);

  return (
    <GuideContext.Provider value={{ steps, active, prefix, navigate }}>
      <div
        ref={container}
        className="space-y-5"
        onKeyDownCapture={(event) => {
          if (
            event.key !== "Enter" ||
            event.nativeEvent.isComposing ||
            activeIndex === steps.length - 1
          )
            return;
          const target = event.target;
          if (
            !(target instanceof HTMLInputElement) ||
            ["checkbox", "radio", "file", "search"].includes(target.type) ||
            target.closest('[role="combobox"]') ||
            target.getAttribute("aria-expanded") !== null
          )
            return;
          event.preventDefault();
          container.current
            ?.querySelector<HTMLButtonElement>(
              `[data-guide-section="${active}"] [data-guide-continue]`,
            )
            ?.click();
        }}
      >
        <div className="space-y-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              {title}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">
              {description}
            </p>
          </div>
          <nav
            aria-label="Form sections"
            className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
          >
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                aria-controls={`${prefix}-${step.id}`}
                aria-current={active === step.id ? "step" : undefined}
                disabled={
                  index > furthest ||
                  (index > activeIndex &&
                    !steps
                      .slice(0, index)
                      .every((previous) => previous.complete))
                }
                onClick={() => navigate(step.id)}
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active === step.id ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:enabled:bg-slate-50"}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${step.complete && !step.optional ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                >
                  {index <= furthest && step.complete && !step.optional ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                {step.title}
              </button>
            ))}
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span aria-live="polite">
              Step {activeIndex + 1} of {steps.length}
            </span>
            <span>
              Complete this section to continue. Fields marked * are required.
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Form progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={activeIndex + 1}
            className="h-1.5 overflow-hidden rounded-full bg-slate-100"
          >
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] motion-reduce:transition-none"
              style={{
                width: `${((activeIndex + 1) / steps.length) * 100}%`,
              }}
            />
          </div>
        </div>
        {children}
      </div>
    </GuideContext.Provider>
  );
}

export function GuidedFormSection({
  id,
  description,
  children,
}: {
  id: string;
  description: string;
  children: React.ReactNode;
}) {
  const guide = useContext(GuideContext);
  const section = useRef<HTMLElement>(null);
  const [attempted, setAttempted] = useState(false);
  if (!guide) throw new Error("GuidedFormSection requires GuidedForm");
  const index = guide.steps.findIndex((step) => step.id === id);
  const step = guide.steps[index];
  const next = guide.steps[index + 1];
  const previous = guide.steps[index - 1];
  const inactive = guide.active !== id;
  const showError = attempted && !step.complete;

  function continueSection() {
    setAttempted(true);
    const inputs = section.current?.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >("input, textarea");
    const invalid = Array.from(inputs ?? []).find(
      (input) => !input.checkValidity(),
    );
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    if (!step.complete) {
      section.current
        ?.querySelector<HTMLElement>("input, textarea, button[aria-expanded]")
        ?.focus();
      return;
    }
    if (next) guide!.navigate(next.id);
  }

  return (
    <section
      ref={section}
      id={`${guide.prefix}-${id}`}
      data-guide-section={id}
      hidden={inactive}
      aria-labelledby={`${guide.prefix}-${id}-title`}
      className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="mb-5 flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${step.complete && !step.optional ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}
        >
          {step.complete && !step.optional ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            index + 1
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id={`${guide.prefix}-${id}-title`}
              tabIndex={-1}
              className="text-sm font-semibold text-slate-900 outline-none"
            >
              {step.title}
            </h3>
            {step.optional && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                Optional
              </span>
            )}
            {step.complete && !step.optional && (
              <span className="text-xs text-emerald-700">Ready</span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <fieldset disabled={inactive} className="min-w-0 border-0 p-0 m-0">
        <div className="space-y-5">{children}</div>
        {showError && (
          <p role="alert" className="mt-4 text-sm text-rose-600">
            Complete the required fields in this section before continuing.
          </p>
        )}
        {(next || previous) && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            {previous ? (
              <button
                type="button"
                onClick={() => guide.navigate(previous.id)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
            ) : (
              <span />
            )}
            {next && (
              <button
                type="button"
                data-guide-continue
                onClick={continueSection}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Continue to {next.title.toLowerCase()}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </fieldset>
    </section>
  );
}

export function GuidedFormReview({
  entries,
  ready,
}: {
  entries: Array<{ label: string; value: string }>;
  ready: boolean;
}) {
  return (
    <>
      <dl className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        {entries.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium text-slate-800">
              {value || "Not filled yet"}
            </dd>
          </div>
        ))}
      </dl>
      <p
        className={`flex items-start gap-2 text-xs leading-5 ${ready ? "text-emerald-700" : "text-slate-500"}`}
        aria-live="polite"
      >
        <ClipboardCheck
          className="mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        {ready
          ? "Required details are ready. Check your choices, then submit below."
          : "Fill the remaining required details above before submitting."}
      </p>
    </>
  );
}
