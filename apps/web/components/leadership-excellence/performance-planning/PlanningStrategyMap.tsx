"use client";
import { planningPeriodLabel } from "@/services/leadership-excellence/performance-planning/planning-period";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, Printer } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { buildStrategyMap } from "@/services/leadership-excellence/performance-planning/strategy-map";
import {
  strategyMapPrintHtml,
  strategyPaperSize,
  type StrategyPaper,
} from "@/services/leadership-excellence/performance-planning/strategy-map-print";
import { planningToday } from "./PlanningLinks";
import { usePlanning } from "./PlanningProvider";
import { Button, control, Empty, Field, Modal } from "./PlanningUi";

export function PlanningStrategyMap({ cycle }: { cycle: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={trigger} variant="outline" onClick={() => setOpen(true)}>
        <Printer size={16} /> Print strategy map
      </Button>
      {open && (
        <StrategyMapPreview
          key={cycle}
          cycle={cycle}
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        />
      )}
    </>
  );
}

function StrategyMapPreview({
  cycle,
  onClose,
}: {
  cycle: string;
  onClose: () => void;
}) {
  const { data } = usePlanning();
  const organizationName = useAuthStore(
    (state) => state.user?.organizationName,
  );
  const [paper, setPaper] = useState<StrategyPaper>("A3");
  const [asOf, setAsOf] = useState(() =>
    planningToday(data.references.timeZone),
  );
  const [includeActions, setIncludeActions] = useState(true);
  const [includeIndividuals, setIncludeIndividuals] = useState(true);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [fit, setFit] = useState<{ html: string; fits: boolean } | null>(null);
  const [error, setError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const map = useMemo(
    () => buildStrategyMap(data, cycle, asOf),
    [data, cycle, asOf],
  );
  const selectedIds = map.objectives
    .filter((objective) => !excluded.includes(objective.id))
    .map((objective) => objective.id);
  const html = strategyMapPrintHtml(map, {
    paper,
    company: map.direction.company || organizationName || "Company strategy",
    cycle,
    asOf,
    objectiveIds: selectedIds,
    includeActions,
    includeIndividuals,
  });
  const canPreview = !!map.plan && selectedIds.length > 0;

  const measure = useCallback(() => {
    const iframe = frame.current;
    const doc = iframe?.contentDocument;
    const sheets = doc?.querySelectorAll<HTMLElement>(".strategy-sheet");
    if (!iframe || !doc || !sheets?.length) return;
    const size = strategyPaperSize(paper);
    const pxPerMm = 96 / 25.4;
    const height = (size.height - 10) * pxPerMm;
    const width = (size.width - 10) * pxPerMm;
    let fits = true;
    for (const sheet of sheets) {
      const content = sheet.querySelector<HTMLElement>(".strategy-content");
      if (!content) continue;
      content.style.setProperty("--content-scale", "1");
      const scale = Math.min(
        1,
        height / content.scrollHeight,
        width / content.scrollWidth,
      );
      if (scale < 0.86) fits = false;
      content.style.setProperty("--content-scale", String(Math.min(1, scale)));
    }
    // Keep the printed content readable. Never clip extra objectives silently.
    // The user can choose A3 or a clearly labelled selection when it won't fit.
    const previewScale = Math.min(
      1,
      iframe.clientWidth / (size.width * pxPerMm),
    );
    doc.documentElement.style.setProperty(
      "--preview-scale",
      String(previewScale),
    );
    iframe.style.height = `${Math.ceil(sheets.length * size.height * pxPerMm * previewScale)}px`;
    setFit((previous) =>
      previous?.html === html && previous.fits === fits
        ? previous
        : { html, fits },
    );
  }, [html, paper]);

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    const observer = new ResizeObserver(measure);
    observer.observe(iframe);
    return () => observer.disconnect();
  }, [measure, canPreview]);

  const ready = canPreview && fit?.html === html && fit.fits;
  const print = () => {
    if (!ready || !frame.current?.contentWindow) return;
    setError("");
    try {
      frame.current.contentWindow.focus();
      frame.current.contentWindow.print();
    } catch {
      setError(
        "The print dialog could not open. Please allow printing in your browser and try again.",
      );
    }
  };

  return (
    <Modal
      title="Print strategy map"
      description={`Planning period ${planningPeriodLabel(cycle)} · Company strategy on one page, with approved individual plans on additional sheets.`}
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Landscape · {paper} · Choose “Save as PDF” in the print dialog.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button disabled={!ready} onClick={print}>
              <Printer size={16} /> Print / Save as PDF
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-36">
            <Field label="Paper size">
              <select
                className={control}
                value={paper}
                onChange={(e) => setPaper(e.target.value as StrategyPaper)}
              >
                <option value="A3">A3 landscape</option>
                <option value="A4">A4 landscape</option>
              </select>
            </Field>
          </div>
          <div className="w-44">
            <Field label="Plan effective as of">
              <input
                type="date"
                className={control}
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </Field>
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includeActions}
              onChange={(e) => setIncludeActions(e.target.checked)}
              className="size-4 accent-[#52618a]"
            />
            {map.objectives.some((objective) => objective.measurement)
              ? "Include department contributions and actions"
              : "Include key improvement actions"}
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includeIndividuals}
              onChange={(event) => setIncludeIndividuals(event.target.checked)}
              className="size-4 accent-[#52618a]"
            />
            Include individual plans ({map.individualGoals.length} goals)
          </label>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          Uses approved plan versions effective on this date and the latest
          approved company direction. Objectives keep their own measures and
          targets. Detailed action steps and confidential SWOT findings stay out
          of the printout. Individual plans use their own approved measures and
          appear on separate sheets.
        </p>
        {map.objectives.length > 1 && (
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Objectives to include ({selectedIds.length} of{" "}
              {map.objectives.length})
            </summary>
            <div className="mt-3 space-y-2">
              {map.objectives.map((objective) => (
                <label
                  key={objective.id}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <input
                    className="mt-1 size-4 shrink-0 accent-[#52618a]"
                    type="checkbox"
                    checked={!excluded.includes(objective.id)}
                    onChange={(e) =>
                      setExcluded((current) =>
                        e.target.checked
                          ? current.filter((id) => id !== objective.id)
                          : [...current, objective.id],
                      )
                    }
                  />
                  <span>
                    {objective.code} · {objective.title}
                  </span>
                </label>
              ))}
            </div>
          </details>
        )}
        {!!map.notices.length && (
          <div className="flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            <Info size={16} className="mt-0.5 shrink-0" />
            <ul className="space-y-1">
              {map.notices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {canPreview && fit?.html === html && !fit.fits && (
          <p
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            A sheet has too much content to remain readable. Choose A3, select
            fewer objectives or hide the department/action summary before
            printing. No details have been removed automatically.
          </p>
        )}
        {canPreview ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <iframe
              ref={frame}
              title="Strategy map print preview"
              srcDoc={html}
              onLoad={measure}
              sandbox="allow-same-origin allow-modals"
              className="block min-h-0 w-full border-0"
            />
          </div>
        ) : (
          <Empty
            title={
              map.plan
                ? "Choose an objective to print"
                : "No approved strategy to print yet"
            }
          >
            {map.plan
              ? "Include at least one objective in this map."
              : "Select the right year and effective date, or approve your company plan before printing."}
          </Empty>
        )}
        {canPreview && (
          <p className="text-xs text-slate-500">
            For the same layout on paper, use {paper}, landscape, 100% scale and
            turn off browser headers and footers. Small-screen preview is scaled
            to fit; the PDF uses full paper size.
          </p>
        )}
      </div>
    </Modal>
  );
}
