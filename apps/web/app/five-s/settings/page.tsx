"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  useAddSampleData,
  useAssignResponsibility,
  useFiveSCapabilities,
  useFiveSChangeLog,
  useFiveSResponsibilities,
  useRemoveResponsibility,
  useRemoveSampleData,
  useSampleDataStatus,
} from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { RESPONSIBILITIES, RESPONSIBILITY_LABELS, type Responsibility } from "@/services/five-s.service";
import {
  EmptyState,
  ErrorNote,
  FiveSDialog,
  Loading,
  PageHeader,
  PersonSelect,
  SampleBadge,
  Surface,
  dangerButton,
  errorMessage,
  formatTimestamp,
  primaryButton,
  secondaryButton,
  selectClass,
} from "@/components/five-s/ui";

const ENTITY_TYPES: { value: string; label: string }[] = [
  { value: "", label: "All records" },
  { value: "AREA", label: "Areas" },
  { value: "AUDIT", label: "Audits" },
  { value: "RED_TAG", label: "Red tags" },
  { value: "STANDARD", label: "Standards" },
  { value: "ROUTINE", label: "Routines" },
  { value: "RESPONSIBILITY", label: "Responsibilities" },
  { value: "SAMPLE", label: "Sample data" },
];

export default function FiveSSettingsPage() {
  const { data: caps, isLoading } = useFiveSCapabilities();
  if (isLoading) return <Loading />;
  if (!caps?.isModuleAdmin) return <ErrorNote>Only 5S administrators can open settings.</ErrorNote>;
  return (
    <div className="space-y-6">
      <PageHeader title="5S settings" description="Responsibilities, change log and sample data." />
      <Responsibilities />
      <SampleData />
      <ChangeLog />
    </div>
  );
}

function Responsibilities() {
  const { toast } = useToast();
  const { data, isLoading, error } = useFiveSResponsibilities(true);
  const assign = useAssignResponsibility();
  const remove = useRemoveResponsibility();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [responsibility, setResponsibility] = useState<Responsibility>("AUDITOR");

  return (
    <Surface>
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold text-slate-900">Responsibilities</h2>
        <p className="text-sm text-slate-500">
          Area owners and action owners come from the records themselves. Assign the module-wide responsibilities here.
        </p>
      </div>
      <form
        className="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!employeeId) return toast("Choose a person", "error");
          assign.mutate(
            { employeeId, responsibility },
            {
              onSuccess: () => {
                toast("Responsibility assigned", "success");
                setEmployeeId(null);
              },
              onError: (err) => toast(errorMessage(err), "error"),
            },
          );
        }}
      >
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Person
          <PersonSelect id="resp-person" value={employeeId} onChange={setEmployeeId} emptyLabel="Choose a person" />
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Responsibility
          <select className={selectClass} value={responsibility} onChange={(e) => setResponsibility(e.target.value as Responsibility)}>
            {RESPONSIBILITIES.map((r) => (
              <option key={r} value={r}>
                {RESPONSIBILITY_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={primaryButton} disabled={assign.isPending}>
          Assign
        </button>
      </form>
      {isLoading && <Loading />}
      {!!error && <ErrorNote>{errorMessage(error)}</ErrorNote>}
      {data && data.length === 0 && <EmptyState title="No responsibilities assigned">System administrators can always manage 5S.</EmptyState>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {data.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{row.employee?.name ?? "—"}</p>
                <p className="text-xs text-slate-500">
                  {row.label}
                  {row.department ? ` · ${row.department}` : ""}
                </p>
              </div>
              <button
                type="button"
                className={secondaryButton}
                aria-label={`Remove ${row.label} from ${row.employee?.name ?? "this person"}`}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(row.id, {
                    onSuccess: () => toast("Responsibility removed", "success"),
                    onError: (err) => toast(errorMessage(err), "error"),
                  })
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

function SampleData() {
  const { toast } = useToast();
  const { data } = useSampleDataStatus();
  const add = useAddSampleData();
  const remove = useRemoveSampleData();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const loaded = (data?.sampleAreas ?? 0) > 0;

  return (
    <Surface className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-slate-900">Sample data</h2>
        <SampleBadge />
      </div>
      <p className="text-sm text-slate-600">
        Loads two training areas, prefixed &quot;SAMPLE&quot;: one submitted audit with its actions, a red tag, an approved standard and a daily routine.
        Sample records are labelled everywhere they appear. Removing them deletes only records in the sample areas.
      </p>
      <p className="text-sm font-medium text-slate-800">{loaded ? `Loaded: ${data?.sampleAreas} sample area(s).` : "Not loaded."}</p>
      <div className="flex flex-wrap gap-2">
        {!loaded ? (
          <button
            type="button"
            className={primaryButton}
            disabled={add.isPending}
            onClick={() =>
              add.mutate(undefined, {
                onSuccess: () => toast("Sample data loaded", "success"),
                onError: (err) => toast(errorMessage(err), "error"),
              })
            }
          >
            {add.isPending ? "Loading…" : "Load sample data"}
          </button>
        ) : (
          <button type="button" className={dangerButton} onClick={() => setConfirmRemove(true)}>
            Remove sample data
          </button>
        )}
      </div>
      <FiveSDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove all sample data?"
        description="Deletes the sample areas and every audit, action, red tag, standard and routine in them. Real records are not affected."
        footer={
          <>
            <button type="button" className={secondaryButton} onClick={() => setConfirmRemove(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={dangerButton}
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast("Sample data removed", "success");
                    setConfirmRemove(false);
                  },
                  onError: (err) => toast(errorMessage(err), "error"),
                })
              }
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{data?.sampleAreas} sample area(s)</p>
      </FiveSDialog>
    </Surface>
  );
}

function ChangeLog() {
  const [entityType, setEntityType] = useState("");
  const { data, isLoading, error } = useFiveSChangeLog(true, { entityType: entityType || undefined, limit: 200 });
  return (
    <Surface>
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Change log</h2>
          <p className="text-sm text-slate-500">Who changed what, newest first. Action history is shown on each action.</p>
        </div>
        <select aria-label="Record type" className={`${selectClass} sm:w-48`} value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          {ENTITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {isLoading && <Loading />}
      {!!error && <ErrorNote>{errorMessage(error)}</ErrorNote>}
      {data && data.length === 0 && <EmptyState title="No changes recorded">Changes appear here as people use the module.</EmptyState>}
      {data && data.length > 0 && (
        <ol className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
          {data.map((row) => (
            <li key={row.id} className="px-5 py-2.5 text-sm">
              <p className="text-slate-900">{row.summary}</p>
              <p className="text-xs text-slate-500">
                {row.actor?.name ?? "System"} · {formatTimestamp(row.createdAt)} · {ENTITY_TYPES.find((t) => t.value === row.entityType)?.label ?? row.entityType}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Surface>
  );
}
