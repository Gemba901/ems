"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import "./work-order-stepper.css";

export const WORK_ORDER_STEPS = [
  "Basic Info",
  "Tasks & Duration",
  "Additional",
  "Cost & Budget",
  "Remarks & Notes",
  "Review",
] as const;

export function WorkOrderStepper({
  activeStep,
  onStepChange,
  disabled = false,
}: {
  activeStep: number;
  onStepChange: (index: number) => void;
  disabled?: boolean;
}) {
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    function keepActiveVisible() {
      if (!container) return;
      const active = container.querySelector<HTMLButtonElement>(
        '[aria-current="step"]',
      );
      if (!active) return;
      const bounds = container.getBoundingClientRect();
      const target = active.getBoundingClientRect();
      if (target.left >= bounds.left && target.right <= bounds.right) return;
      container.scrollTo({
        left:
          container.scrollLeft +
          target.left -
          bounds.left -
          (container.clientWidth - target.width) / 2,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
    keepActiveVisible();
    const observer = new ResizeObserver(keepActiveVisible);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeStep]);

  return (
    <nav className="wo-stepper" aria-label="Work order steps" ref={scrollRef}>
      <ol className="wo-stepper-list">
        {WORK_ORDER_STEPS.map((label, index) => {
          const complete = index < activeStep;
          const current = index === activeStep;
          return (
            <li
              key={label}
              className={`wo-stepper-item${complete ? " is-complete" : ""}${current ? " is-active" : ""}`}
            >
              <button
                type="button"
                className="wo-stepper-button"
                disabled={disabled}
                aria-label={`Step ${index + 1}: ${label}`}
                aria-current={current ? "step" : undefined}
                onClick={() => onStepChange(index)}
              >
                <span className="wo-stepper-circle" aria-hidden="true">
                  {complete ? <Check size={19} strokeWidth={2.5} /> : index + 1}
                </span>
                <span className="wo-stepper-label">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
