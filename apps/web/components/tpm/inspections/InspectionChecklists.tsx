"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Copy,
  Eye,
  FileText,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useToast } from "@/contexts/toast.context";
import { useInspections } from "./InspectionsProvider";
import {
  INSPECTION_FREQUENCIES,
  emptyChecklist,
  newInspectionItem,
  validateChecklist,
  type ChecklistInput,
  type InspectionChecklist,
  type InspectionItem,
} from "./inspection-preview";
import "./inspection-checklists.css";

function ChecklistNavigation({
  beforeNavigate,
}: {
  beforeNavigate?: () => boolean;
}) {
  return (
    <nav className="insp-tabs" aria-label="Inspection pages">
      <Link
        href="/tpm/inspections"
        aria-current="page"
        onClick={(event) => {
          if (beforeNavigate && !beforeNavigate()) event.preventDefault();
        }}
      >
        <ClipboardList size={16} /> Inspection checklists
      </Link>
      <Link
        href="/tpm/inspection-reports"
        onClick={(event) => {
          if (beforeNavigate && !beforeNavigate()) event.preventDefault();
        }}
      >
        <FileText size={16} /> Inspection reports
      </Link>
    </nav>
  );
}

function ChecklistState() {
  const { loading, error, retry } = useInspections();
  return (
    <div className="insp-checklist-empty" role={error ? "alert" : "status"}>
      <ClipboardList size={30} />
      <h2>
        {loading
          ? "Loading inspection checklists…"
          : "Could not load checklists"}
      </h2>
      {error && (
        <>
          <p>{error}</p>
          <button className="tpm-button" onClick={retry}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: InspectionChecklist["status"] }) {
  return (
    <span className={`insp-checklist-status ${status.toLowerCase()}`}>
      <span />
      {status}
    </span>
  );
}

export function InspectionChecklists() {
  const { checklists, loading, error, duplicateChecklist, setChecklistStatus } =
    useInspections();
  const { toast } = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("Current");
  const current = checklists.filter((item) => item.status !== "Archived");
  const visible = checklists
    .filter((item) => {
      const needle = search.trim().toLowerCase();
      return (
        (!needle ||
          `${item.name} ${item.code} ${item.description}`
            .toLowerCase()
            .includes(needle)) &&
        (!kind || item.kind === kind) &&
        (status === "All" ||
          (status === "Current"
            ? item.status !== "Archived"
            : item.status === status))
      );
    })
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name),
    );

  function duplicate(id: string) {
    try {
      const checklist = duplicateChecklist(id);
      toast("Checklist duplicated as a draft", "success");
      router.push(`/tpm/inspections/${checklist.id}/edit`);
    } catch (cause) {
      toast(
        cause instanceof Error
          ? cause.message
          : "Could not duplicate checklist.",
        "error",
      );
    }
  }
  function changeStatus(checklist: InspectionChecklist) {
    const nextStatus = checklist.status === "Archived" ? "Draft" : "Archived";
    if (
      nextStatus === "Archived" &&
      !window.confirm(
        `Archive “${checklist.name}”? Existing inspection reports will remain available.`,
      )
    )
      return;
    try {
      setChecklistStatus(checklist.id, nextStatus);
      toast(
        nextStatus === "Archived"
          ? "Checklist archived"
          : "Checklist restored as a draft",
        "success",
      );
    } catch (cause) {
      toast(
        cause instanceof Error ? cause.message : "Could not update checklist.",
        "error",
      );
    }
  }

  if (loading || error) return <ChecklistState />;
  return (
    <div className="insp-checklists">
      <header className="tpm-page-heading">
        <div>
          <h1>
            Inspection checklists{" "}
            <span className="tpm-count">{current.length}</span>
          </h1>
          <p>Build repeatable AM and PM checks for your equipment.</p>
        </div>
        <Link href="/tpm/inspections/new" className="tpm-button primary">
          <Plus size={17} /> New checklist
        </Link>
      </header>
      <ChecklistNavigation />
      <section
        className="insp-checklist-metrics"
        aria-label="Checklist summary"
      >
        {[
          {
            label: "Total checklists",
            value: current.length,
            icon: ClipboardList,
            tone: "blue",
          },
          {
            label: "Published",
            value: current.filter((item) => item.status === "Published").length,
            icon: CheckCircle2,
            tone: "green",
          },
          {
            label: "Autonomous maintenance",
            value: current.filter((item) => item.kind === "AM").length,
            icon: ClipboardCheck,
            tone: "purple",
          },
          {
            label: "Preventive maintenance",
            value: current.filter((item) => item.kind === "PM").length,
            icon: Wrench,
            tone: "orange",
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div className="insp-checklist-metric" key={label}>
            <span className={`insp-checklist-metric-icon ${tone}`}>
              <Icon size={19} />
            </span>
            <div>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          </div>
        ))}
      </section>
      <section
        className="insp-checklist-toolbar"
        aria-label="Search and filter checklists"
      >
        <div className="insp-checklist-search">
          <Search size={17} />
          <input
            aria-label="Search checklists"
            placeholder="Search checklist name or code…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button aria-label="Clear search" onClick={() => setSearch("")}>
              <X size={15} />
            </button>
          )}
        </div>
        <label>
          <span>Type</span>
          <select
            aria-label="Checklist type filter"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="">All types</option>
            <option value="AM">AM · Autonomous</option>
            <option value="PM">PM · Preventive</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            aria-label="Checklist status filter"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {["Current", "Published", "Draft", "Archived", "All"].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
      </section>
      <div className="insp-checklist-list-heading">
        <h2>
          Checklists <span>({visible.length})</span>
        </h2>
        <span>Publish a checklist to start an inspection.</span>
      </div>
      {visible.length === 0 ? (
        <div className="insp-checklist-empty">
          <ClipboardList size={32} />
          <h2>
            {checklists.length
              ? "No matching checklists"
              : "Create your first checklist"}
          </h2>
          <p>
            {checklists.length
              ? "Try another search or change your filters."
              : "Add the checks your operators and technicians need to perform."}
          </p>
          {checklists.length ? (
            <button
              className="tpm-button"
              onClick={() => {
                setSearch("");
                setKind("");
                setStatus("Current");
              }}
            >
              Reset filters
            </button>
          ) : (
            <Link className="tpm-button primary" href="/tpm/inspections/new">
              <Plus size={16} />
              New checklist
            </Link>
          )}
        </div>
      ) : (
        <div className="insp-checklist-list">
          {visible.map((checklist) => (
            <article className="insp-checklist-card" key={checklist.id}>
              <span
                className={`insp-checklist-card-icon ${checklist.kind.toLowerCase()}`}
              >
                {checklist.kind === "AM" ? (
                  <ClipboardCheck size={22} />
                ) : (
                  <Wrench size={22} />
                )}
              </span>
              <div className="insp-checklist-card-body">
                <div className="insp-checklist-card-title">
                  <h3>
                    <Link href={`/tpm/inspections/${checklist.id}/edit`}>
                      {checklist.name}
                    </Link>
                  </h3>
                  <StatusBadge status={checklist.status} />
                </div>
                <p>{checklist.description || "No description added."}</p>
                <div className="insp-checklist-meta">
                  <span>{checklist.code}</span>
                  <span
                    className={`insp-checklist-kind ${checklist.kind.toLowerCase()}`}
                  >
                    {checklist.kind}
                  </span>
                  <span>
                    <Clock3 size={13} />
                    {checklist.frequency}
                  </span>
                  <span>
                    <ClipboardList size={13} />
                    {checklist.items.length} checks
                  </span>
                  <span>v{checklist.version}</span>
                </div>
              </div>
              <div className="insp-checklist-card-actions">
                {checklist.status === "Published" && (
                  <Link
                    className="tpm-button primary"
                    href={`/tpm/inspection-reports/new?checklist=${encodeURIComponent(checklist.id)}`}
                  >
                    <Play size={14} />
                    Start inspection
                  </Link>
                )}
                <Link
                  className="tpm-button"
                  href={`/tpm/inspections/${checklist.id}/edit`}
                >
                  <Pencil size={14} />
                  Open
                </Link>
                <button
                  className="insp-checklist-icon-button"
                  title="Duplicate checklist"
                  aria-label={`Duplicate ${checklist.name}`}
                  onClick={() => duplicate(checklist.id)}
                >
                  <Copy size={17} />
                </button>
                <button
                  className="insp-checklist-icon-button"
                  title={
                    checklist.status === "Archived"
                      ? "Restore as draft"
                      : "Archive checklist"
                  }
                  aria-label={`${checklist.status === "Archived" ? "Restore" : "Archive"} ${checklist.name}`}
                  onClick={() => changeStatus(checklist)}
                >
                  <Archive size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function InspectionChecklistEditor({ id }: { id?: string }) {
  const { checklists, loading, error } = useInspections();
  if (loading || error) return <ChecklistState />;
  const checklist = id ? checklists.find((item) => item.id === id) : undefined;
  if (id && !checklist)
    return (
      <div className="insp-checklist-empty">
        <h1>Checklist not found</h1>
        <Link className="tpm-button" href="/tpm/inspections">
          Back to checklists
        </Link>
      </div>
    );
  return <ChecklistEditorForm key={id ?? "new"} checklist={checklist} />;
}

function ChecklistEditorForm({
  checklist,
}: {
  checklist?: InspectionChecklist;
}) {
  const { saveChecklist } = useInspections();
  const router = useRouter();
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<ChecklistInput>(() =>
    checklist
      ? { ...checklist, items: checklist.items.map((item) => ({ ...item })) }
      : emptyChecklist(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const archived = checklist?.status === "Archived";

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  function canLeave() {
    return !dirty || window.confirm("Discard your unsaved checklist changes?");
  }
  function cancel() {
    if (canLeave()) router.push("/tpm/inspections");
  }
  function update<K extends keyof ChecklistInput>(
    key: K,
    value: ChecklistInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setErrors((current) => ({ ...current, [key]: "" }));
    setSaveError("");
  }
  function updateItem<K extends keyof InspectionItem>(
    id: string,
    key: K,
    value: InspectionItem[K],
  ) {
    update(
      "items",
      form.items.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    );
    setErrors((current) => ({
      ...current,
      [`items.${id}.${key}`]: "",
      [`items.${id}.range`]: "",
    }));
  }
  function moveItem(index: number, offset: number) {
    const items = [...form.items];
    [items[index], items[index + offset]] = [
      items[index + offset],
      items[index],
    ];
    update("items", items);
  }
  function removeItem(item: InspectionItem) {
    if (
      (item.title || item.instructions) &&
      !window.confirm(`Remove “${item.title || "this inspection check"}”?`)
    )
      return;
    update(
      "items",
      form.items.filter((entry) => entry.id !== item.id),
    );
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => !key.startsWith(`items.${item.id}.`),
        ),
      ),
    );
  }
  function save(status: "Draft" | "Published") {
    if (archived) return;
    const input = { ...form, status };
    const validation = validateChecklist(input);
    setErrors(validation);
    setSaveError("");
    if (Object.values(validation).some(Boolean)) {
      setPreview(false);
      window.setTimeout(
        () =>
          formRef.current
            ?.querySelector<HTMLElement>("[aria-invalid='true']")
            ?.focus(),
        0,
      );
      return;
    }
    setSaving(true);
    try {
      saveChecklist(input, checklist?.id);
      setDirty(false);
      toast(
        status === "Published"
          ? "Checklist published successfully"
          : "Checklist saved as a draft",
        "success",
      );
      router.push("/tpm/inspections");
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Could not save the checklist.",
      );
    } finally {
      setSaving(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    save("Published");
  }
  const errorMessages = [...new Set(Object.values(errors).filter(Boolean))];

  return (
    <div className="insp-checklists insp-checklist-editor">
      <button className="insp-checklist-back" onClick={cancel}>
        <ArrowLeft size={16} />
        Back to checklists
      </button>
      <header className="tpm-page-heading">
        <div>
          <h1>{checklist ? "Edit checklist" : "New inspection checklist"}</h1>
          <p>
            {checklist
              ? `${checklist.code} · Version ${checklist.version}`
              : "Set up the checks to perform during an asset inspection."}
          </p>
        </div>
        <div className="tpm-actions">
          {checklist && <StatusBadge status={checklist.status} />}
          <button
            className="tpm-button"
            onClick={() => setPreview(!preview)}
            aria-pressed={preview}
          >
            {preview ? <Pencil size={16} /> : <Eye size={16} />}
            {preview ? "Edit checklist" : "Preview"}
          </button>
        </div>
      </header>
      <ChecklistNavigation beforeNavigate={canLeave} />
      {archived && (
        <div className="insp-checklist-notice">
          <Archive size={17} />
          This checklist is archived. Restore it as a draft from the checklist
          list to make changes.
        </div>
      )}
      <form ref={formRef} onSubmit={submit} noValidate>
        {(saveError || errorMessages.length > 0) && (
          <div className="insp-checklist-errors" role="alert">
            <strong>
              {saveError || "Check the highlighted fields before saving."}
            </strong>
            {errorMessages.length > 0 && (
              <ul>
                {errorMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {preview ? (
          <ChecklistPreview form={form} />
        ) : (
          <>
            <section className="insp-checklist-section">
              <div className="insp-checklist-section-title">
                <span className="insp-checklist-step">1</span>
                <div>
                  <h2>Checklist details</h2>
                  <p>Give your checklist a clear name and maintenance type.</p>
                </div>
              </div>
              <fieldset disabled={archived} className="insp-checklist-fields">
                <div className="tpm-field insp-checklist-full">
                  <label htmlFor="inspection-checklist-name">
                    Checklist name <span aria-label="required">*</span>
                  </label>
                  <input
                    id="inspection-checklist-name"
                    maxLength={200}
                    placeholder="e.g. Filling machine — daily operator checks"
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    aria-invalid={!!errors.name}
                    aria-describedby={
                      errors.name
                        ? "inspection-checklist-name-error"
                        : undefined
                    }
                  />
                  {errors.name && (
                    <p
                      id="inspection-checklist-name-error"
                      className="tpm-field-error"
                    >
                      {errors.name}
                    </p>
                  )}
                </div>
                <div className="tpm-field">
                  <label htmlFor="inspection-checklist-kind">
                    Maintenance type
                  </label>
                  <select
                    id="inspection-checklist-kind"
                    value={form.kind}
                    onChange={(event) =>
                      update(
                        "kind",
                        event.target.value as ChecklistInput["kind"],
                      )
                    }
                  >
                    <option value="AM">AM — Autonomous maintenance</option>
                    <option value="PM">PM — Preventive maintenance</option>
                  </select>
                  <p className="tpm-field-hint">
                    {form.kind === "AM"
                      ? "Routine checks performed by the equipment operator."
                      : "Planned checks performed by the maintenance team."}
                  </p>
                </div>
                <div className="tpm-field">
                  <label htmlFor="inspection-checklist-frequency">
                    Suggested frequency
                  </label>
                  <select
                    id="inspection-checklist-frequency"
                    value={form.frequency}
                    onChange={(event) =>
                      update(
                        "frequency",
                        event.target.value as ChecklistInput["frequency"],
                      )
                    }
                  >
                    {INSPECTION_FREQUENCIES.map((frequency) => (
                      <option key={frequency}>{frequency}</option>
                    ))}
                  </select>
                  <p className="tpm-field-hint">
                    A guide for inspectors; this does not schedule inspections.
                  </p>
                </div>
                <div className="tpm-field insp-checklist-full">
                  <label htmlFor="inspection-checklist-description">
                    Description <span>optional</span>
                  </label>
                  <textarea
                    id="inspection-checklist-description"
                    maxLength={2000}
                    rows={2}
                    placeholder="What should the inspector know before starting?"
                    value={form.description}
                    onChange={(event) =>
                      update("description", event.target.value)
                    }
                  />
                </div>
              </fieldset>
            </section>
            <section className="insp-checklist-section insp-checklist-checks-section">
              <div className="insp-checklist-section-title">
                <span className="insp-checklist-step">2</span>
                <div>
                  <h2>
                    Inspection checks{" "}
                    <span className="tpm-count">{form.items.length}</span>
                  </h2>
                  <p>Add each check in the order it should be performed.</p>
                </div>
              </div>
              {errors.items && (
                <p className="tpm-field-error" role="alert">
                  {errors.items}
                </p>
              )}
              <div className="insp-checklist-items">
                {form.items.map((item, index) => (
                  <fieldset
                    className="insp-checklist-item"
                    disabled={archived}
                    key={item.id}
                  >
                    <legend className="insp-checklist-sr-only">
                      Check {index + 1}
                    </legend>
                    <div className="insp-checklist-item-heading">
                      <span>
                        <span className="insp-checklist-item-number">
                          {index + 1}
                        </span>
                        Inspection check
                      </span>
                      <div>
                        <button
                          type="button"
                          className="insp-checklist-icon-button"
                          disabled={index === 0}
                          aria-label={`Move check ${index + 1} up`}
                          onClick={() => moveItem(index, -1)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          type="button"
                          className="insp-checklist-icon-button"
                          disabled={index === form.items.length - 1}
                          aria-label={`Move check ${index + 1} down`}
                          onClick={() => moveItem(index, 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          type="button"
                          className="insp-checklist-icon-button danger"
                          aria-label={`Remove check ${index + 1}`}
                          onClick={() => removeItem(item)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="insp-checklist-item-fields">
                      <div className="tpm-field insp-checklist-full">
                        <label htmlFor={`check-title-${item.id}`}>
                          Check / question <span aria-label="required">*</span>
                        </label>
                        <input
                          id={`check-title-${item.id}`}
                          maxLength={300}
                          placeholder="e.g. Are the machine guards secure?"
                          value={item.title}
                          onChange={(event) =>
                            updateItem(item.id, "title", event.target.value)
                          }
                          aria-invalid={!!errors[`items.${item.id}.title`]}
                          aria-describedby={
                            errors[`items.${item.id}.title`]
                              ? `check-title-error-${item.id}`
                              : undefined
                          }
                        />
                        {errors[`items.${item.id}.title`] && (
                          <p
                            className="tpm-field-error"
                            id={`check-title-error-${item.id}`}
                          >
                            {errors[`items.${item.id}.title`]}
                          </p>
                        )}
                      </div>
                      <div className="tpm-field">
                        <label htmlFor={`check-section-${item.id}`}>
                          Section <span>optional</span>
                        </label>
                        <input
                          id={`check-section-${item.id}`}
                          maxLength={120}
                          placeholder="e.g. Safety & guarding"
                          value={item.section}
                          onChange={(event) =>
                            updateItem(item.id, "section", event.target.value)
                          }
                        />
                      </div>
                      <div className="tpm-field">
                        <label htmlFor={`check-type-${item.id}`}>
                          Response type
                        </label>
                        <select
                          id={`check-type-${item.id}`}
                          value={item.responseType}
                          onChange={(event) =>
                            updateItem(
                              item.id,
                              "responseType",
                              event.target
                                .value as InspectionItem["responseType"],
                            )
                          }
                        >
                          <option>Pass / Fail</option>
                          <option>Number</option>
                          <option>Text</option>
                        </select>
                      </div>
                      <div className="tpm-field insp-checklist-full">
                        <label htmlFor={`check-instructions-${item.id}`}>
                          Instructions <span>optional</span>
                        </label>
                        <textarea
                          id={`check-instructions-${item.id}`}
                          maxLength={2000}
                          rows={2}
                          placeholder="Describe what to inspect and the expected condition."
                          value={item.instructions}
                          onChange={(event) =>
                            updateItem(
                              item.id,
                              "instructions",
                              event.target.value,
                            )
                          }
                        />
                      </div>
                      {item.responseType === "Number" && (
                        <div className="insp-checklist-number-fields insp-checklist-full">
                          <div className="tpm-field">
                            <label htmlFor={`check-unit-${item.id}`}>
                              Unit <span>optional</span>
                            </label>
                            <input
                              id={`check-unit-${item.id}`}
                              maxLength={40}
                              placeholder="e.g. °C, bar, mm"
                              value={item.unit}
                              onChange={(event) =>
                                updateItem(item.id, "unit", event.target.value)
                              }
                            />
                          </div>
                          <div className="tpm-field">
                            <label htmlFor={`check-min-${item.id}`}>
                              Minimum <span>optional</span>
                            </label>
                            <input
                              id={`check-min-${item.id}`}
                              type="number"
                              step="any"
                              placeholder="No minimum"
                              value={item.min}
                              aria-invalid={!!errors[`items.${item.id}.range`]}
                              onChange={(event) =>
                                updateItem(item.id, "min", event.target.value)
                              }
                            />
                          </div>
                          <div className="tpm-field">
                            <label htmlFor={`check-max-${item.id}`}>
                              Maximum <span>optional</span>
                            </label>
                            <input
                              id={`check-max-${item.id}`}
                              type="number"
                              step="any"
                              placeholder="No maximum"
                              value={item.max}
                              aria-invalid={!!errors[`items.${item.id}.range`]}
                              onChange={(event) =>
                                updateItem(item.id, "max", event.target.value)
                              }
                            />
                          </div>
                          {errors[`items.${item.id}.range`] && (
                            <p className="tpm-field-error insp-checklist-full">
                              {errors[`items.${item.id}.range`]}
                            </p>
                          )}
                          <p className="tpm-field-hint insp-checklist-full">
                            Readings outside this range will be flagged in the
                            inspection report.
                          </p>
                        </div>
                      )}
                      <div className="insp-checklist-item-options insp-checklist-full">
                        <label>
                          <input
                            type="checkbox"
                            checked={item.required}
                            onChange={(event) =>
                              updateItem(
                                item.id,
                                "required",
                                event.target.checked,
                              )
                            }
                          />
                          Required response
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={item.allowNa}
                            onChange={(event) =>
                              updateItem(
                                item.id,
                                "allowNa",
                                event.target.checked,
                              )
                            }
                          />
                          Allow N/A
                        </label>
                      </div>
                    </div>
                  </fieldset>
                ))}
              </div>
              {!form.items.length && (
                <div className="insp-checklist-empty small">
                  <ClipboardList size={26} />
                  <p>No checks yet. Add the first inspection check below.</p>
                </div>
              )}
              <button
                type="button"
                className="insp-checklist-add"
                disabled={archived || form.items.length >= 100}
                onClick={() => {
                  const item = newInspectionItem();
                  update("items", [...form.items, item]);
                  window.setTimeout(
                    () =>
                      document
                        .getElementById(`check-title-${item.id}`)
                        ?.focus(),
                    0,
                  );
                }}
              >
                <Plus size={18} />
                Add inspection check
              </button>
            </section>
          </>
        )}
        <footer className="insp-checklist-editor-footer">
          <span>
            {form.items.length} checks ·{" "}
            {form.items.filter((item) => item.required).length} required
            {dirty ? " · Unsaved changes" : ""}
          </span>
          <div>
            <button type="button" className="tpm-button" onClick={cancel}>
              Cancel
            </button>
            <button
              type="button"
              className="tpm-button"
              disabled={saving || archived}
              onClick={() => save("Draft")}
            >
              <FileText size={15} />
              Save draft
            </button>
            <button
              type="submit"
              className="tpm-button primary"
              disabled={saving || archived}
            >
              <Check size={16} />
              {saving ? "Saving…" : "Publish checklist"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function ChecklistPreview({ form }: { form: ChecklistInput }) {
  return (
    <section
      className="insp-checklist-section insp-checklist-preview"
      aria-label="Checklist preview"
    >
      <div className="insp-checklist-preview-heading">
        <span className={`insp-checklist-kind ${form.kind.toLowerCase()}`}>
          {form.kind}
        </span>
        <span>{form.frequency}</span>
        <span>Preview</span>
      </div>
      <h2>{form.name || "Untitled checklist"}</h2>
      {form.description && <p>{form.description}</p>}
      {!form.items.length && <p>No inspection checks added yet.</p>}
      {form.items.map((item, index) => (
        <div className="insp-checklist-preview-item" key={item.id}>
          {item.section && (
            <span className="insp-checklist-preview-section">
              {item.section}
            </span>
          )}
          <h3>
            <span>{index + 1}.</span>
            {item.title || "Untitled check"}
            {item.required && (
              <span className="insp-checklist-required">*</span>
            )}
          </h3>
          {item.instructions && <p>{item.instructions}</p>}
          {item.responseType === "Pass / Fail" ? (
            <div className="insp-checklist-preview-choices">
              <span>Pass</span>
              <span>Fail</span>
              {item.allowNa && <span>N/A</span>}
            </div>
          ) : (
            <div className="insp-checklist-preview-response">
              <span>
                {item.responseType === "Number"
                  ? `Number${item.unit ? ` (${item.unit})` : ""}`
                  : "Written response"}
              </span>
              {item.allowNa && <span>N/A allowed</span>}
            </div>
          )}
          {item.responseType === "Number" && (item.min || item.max) && (
            <p className="insp-checklist-preview-range">
              Expected: {item.min || "No minimum"} to {item.max || "No maximum"}
              {item.unit ? ` ${item.unit}` : ""}
            </p>
          )}
        </div>
      ))}
      <div className="insp-checklist-preview-note">
        <Eye size={16} />
        This is a checklist preview. Start an inspection to record responses
        against an asset.
      </div>
    </section>
  );
}
