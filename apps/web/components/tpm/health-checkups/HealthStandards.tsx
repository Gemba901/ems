"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Copy,
  FileHeart,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useToast } from "@/contexts/toast.context";
import { useHealthCheckups } from "./HealthCheckupsProvider";
import { HealthCheckupTabs } from "./HealthCheckupTabs";
import {
  HEALTH_RESPONSE_TYPES,
  MACHINE_TYPE_SUGGESTIONS,
  emptyStandard,
  newHealthCheckItem,
  validateStandard,
  type HealthCheckItem,
  type HealthStandard,
  type StandardInput,
} from "./health-checkup-preview";

function LoadingState({ error, retry }: { error?: string | null; retry?: () => void }) {
  return (
    <div className="hc-empty" role={error ? "alert" : "status"}>
      <FileHeart size={30} />
      <h2>{error ? "Could not load standards" : "Loading standards…"}</h2>
      {error && (
        <>
          <p>{error}</p>
          <button type="button" className="tpm-button" onClick={retry}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}

export function HealthStandards() {
  const {
    standards,
    loading,
    error,
    retry,
    duplicateStandard,
    setStandardStatus,
  } = useHealthCheckups();
  const { toast } = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Current");
  const current = standards.filter((item) => item.status !== "Archived");
  const visible = standards
    .filter((item) => {
      const needle = search.trim().toLowerCase();
      return (
        (!needle ||
          `${item.name} ${item.code} ${item.machineType} ${item.description}`
            .toLowerCase()
            .includes(needle)) &&
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

  if (loading || error) return <LoadingState error={error} retry={retry} />;

  return (
    <div className="hc-workspace">
      <header className="tpm-page-heading">
        <div>
          <h1>
            Asset health standards{" "}
            <span className="tpm-count">{current.length}</span>
          </h1>
          <p>
            Create a standard for each machine type. Define checks and acceptable
            results for your maintenance team.
          </p>
        </div>
        <Link
          href="/tpm/health-checkups/standards/new"
          className="tpm-button primary"
        >
          <Plus size={17} /> New standard
        </Link>
      </header>
      <HealthCheckupTabs />
      <section className="hc-metrics" aria-label="Standards summary">
        {[
          {
            label: "Total standards",
            value: current.length,
            icon: FileHeart,
            tone: "blue",
          },
          {
            label: "Published",
            value: current.filter((item) => item.status === "Published").length,
            icon: CheckCircle2,
            tone: "green",
          },
          {
            label: "Drafts",
            value: current.filter((item) => item.status === "Draft").length,
            icon: Pencil,
            tone: "amber",
          },
          {
            label: "Machine types",
            value: new Set(current.map((item) => item.machineType)).size,
            icon: Copy,
            tone: "purple",
          },
        ].map((metric) => (
          <div key={metric.label} className="hc-metric">
            <span className={`hc-metric-icon ${metric.tone}`}>
              <metric.icon size={18} />
            </span>
            <div>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          </div>
        ))}
      </section>
      <div className="hc-toolbar">
        <label className="hc-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search standards…"
            aria-label="Search standards"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter by status"
        >
          <option value="Current">Current</option>
          <option value="Published">Published</option>
          <option value="Draft">Draft</option>
          <option value="Archived">Archived</option>
          <option value="All">All</option>
        </select>
      </div>
      {visible.length === 0 ? (
        <div className="hc-empty">
          <FileHeart size={30} />
          <h2>No standards yet</h2>
          <p>
            Start with a motor checkup covering temperature, vibration, noise,
            and lubrication — then publish it for scheduling.
          </p>
          <Link
            href="/tpm/health-checkups/standards/new"
            className="tpm-button primary"
          >
            <Plus size={16} /> Create standard
          </Link>
        </div>
      ) : (
        <div className="hc-table-wrap">
          <table className="hc-table">
            <thead>
              <tr>
                <th>Standard</th>
                <th>Machine type</th>
                <th>Checks</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((standard) => (
                <tr key={standard.id}>
                  <td>
                    <Link
                      href={`/tpm/health-checkups/standards/${standard.id}/edit`}
                    >
                      {standard.name}
                    </Link>
                    <div style={{ color: "#697f9a", marginTop: 4 }}>
                      {standard.code} · v{standard.version}
                    </div>
                  </td>
                  <td>{standard.machineType}</td>
                  <td>{standard.items.length}</td>
                  <td>
                    <span
                      className={`hc-badge ${standard.status.toLowerCase()}`}
                    >
                      {standard.status}
                    </span>
                  </td>
                  <td>
                    <div className="hc-row-actions">
                      <Link
                        className="tpm-button"
                        href={`/tpm/health-checkups/standards/${standard.id}/edit`}
                      >
                        <Pencil size={14} /> Edit
                      </Link>
                      {standard.status === "Draft" && (
                        <button
                          type="button"
                          className="tpm-button"
                          onClick={() => {
                            try {
                              setStandardStatus(standard.id, "Published");
                              toast("Standard published", "success");
                            } catch (cause) {
                              toast(
                                cause instanceof Error
                                  ? cause.message
                                  : "Could not publish.",
                                "error",
                              );
                            }
                          }}
                        >
                          Publish
                        </button>
                      )}
                      <button
                        type="button"
                        className="tpm-button"
                        onClick={() => {
                          try {
                            const copy = duplicateStandard(standard.id);
                            toast("Standard duplicated as a draft", "success");
                            router.push(
                              `/tpm/health-checkups/standards/${copy.id}/edit`,
                            );
                          } catch (cause) {
                            toast(
                              cause instanceof Error
                                ? cause.message
                                : "Could not duplicate.",
                              "error",
                            );
                          }
                        }}
                      >
                        <Copy size={14} /> Duplicate
                      </button>
                      <button
                        type="button"
                        className="tpm-button"
                        onClick={() => {
                          const next =
                            standard.status === "Archived"
                              ? "Draft"
                              : "Archived";
                          if (
                            next === "Archived" &&
                            !window.confirm(
                              `Archive “${standard.name}”? Existing checkups stay available.`,
                            )
                          )
                            return;
                          try {
                            setStandardStatus(standard.id, next);
                            toast(
                              next === "Archived"
                                ? "Standard archived"
                                : "Standard restored as a draft",
                              "success",
                            );
                          } catch (cause) {
                            toast(
                              cause instanceof Error
                                ? cause.message
                                : "Could not update standard.",
                              "error",
                            );
                          }
                        }}
                      >
                        <Archive size={14} />{" "}
                        {standard.status === "Archived" ? "Restore" : "Archive"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function HealthStandardEditor({
  standard,
}: {
  standard?: HealthStandard;
}) {
  const { saveStandard, setStandardStatus, loading, error, retry } =
    useHealthCheckups();
  const { toast } = useToast();
  const router = useRouter();
  const [form, setForm] = useState<StandardInput>(() =>
    standard
      ? {
          name: standard.name,
          machineType: standard.machineType,
          description: standard.description,
          status: standard.status,
          items: standard.items.map((item) => ({ ...item })),
        }
      : emptyStandard(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (loading || error) return <LoadingState error={error} retry={retry} />;

  function updateItem(id: string, patch: Partial<HealthCheckItem>) {
    setDirty(true);
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  }

  function moveItem(id: string, direction: -1 | 1) {
    setDirty(true);
    setForm((current) => {
      const index = current.items.findIndex((item) => item.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= current.items.length) return current;
      const items = [...current.items];
      const [row] = items.splice(index, 1);
      items.splice(next, 0, row);
      return { ...current, items };
    });
  }

  function submit(event: FormEvent, publish = false) {
    event.preventDefault();
    const next = { ...form, status: publish ? "Published" : form.status };
    const validation = validateStandard(next);
    setErrors(validation);
    if (Object.keys(validation).length) {
      toast(Object.values(validation)[0], "error");
      return;
    }
    try {
      const saved = saveStandard(next, standard?.id);
      if (publish && saved.status !== "Published")
        setStandardStatus(saved.id, "Published");
      setDirty(false);
      toast(publish ? "Standard published" : "Standard saved", "success");
      router.push("/tpm/health-checkups");
    } catch (cause) {
      toast(
        cause instanceof Error ? cause.message : "Could not save standard.",
        "error",
      );
    }
  }

  return (
    <div className="hc-workspace">
      <header className="tpm-page-heading">
        <div>
          <Link href="/tpm/health-checkups" className="tpm-eyebrow">
            <ArrowLeft size={14} /> Back to standards
          </Link>
          <h1>{standard ? "Edit standard" : "New health standard"}</h1>
          <p>
            Define checks and acceptable results for one machine type — for
            example temperature, vibration, noise, and lubrication on a motor.
          </p>
        </div>
      </header>
      <HealthCheckupTabs />
      <form className="hc-panel" onSubmit={(event) => submit(event, false)}>
        <div className="hc-form-grid">
          <div className="tpm-field">
            <label htmlFor="hc-std-name">Standard name</label>
            <input
              id="hc-std-name"
              value={form.name}
              onChange={(event) => {
                setDirty(true);
                setForm({ ...form, name: event.target.value });
              }}
              aria-invalid={!!errors.name}
              maxLength={200}
              placeholder="Motor health checkup"
            />
            {errors.name && <p className="hc-error">{errors.name}</p>}
          </div>
          <div className="tpm-field">
            <label htmlFor="hc-std-type">Machine type</label>
            <input
              id="hc-std-type"
              list="hc-machine-types"
              value={form.machineType}
              onChange={(event) => {
                setDirty(true);
                setForm({ ...form, machineType: event.target.value });
              }}
              aria-invalid={!!errors.machineType}
              maxLength={120}
              placeholder="Motor"
            />
            <datalist id="hc-machine-types">
              {MACHINE_TYPE_SUGGESTIONS.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
            {errors.machineType && (
              <p className="hc-error">{errors.machineType}</p>
            )}
          </div>
          <div className="tpm-field full">
            <label htmlFor="hc-std-desc">Description</label>
            <textarea
              id="hc-std-desc"
              rows={3}
              value={form.description}
              onChange={(event) => {
                setDirty(true);
                setForm({ ...form, description: event.target.value });
              }}
              maxLength={2000}
              placeholder="What this standard covers and who owns the acceptable ranges…"
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            margin: "22px 0 12px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>Checkup items</h2>
          <button
            type="button"
            className="tpm-button"
            onClick={() => {
              setDirty(true);
              setForm({
                ...form,
                items: [...form.items, newHealthCheckItem()],
              });
            }}
          >
            <Plus size={14} /> Add check
          </button>
        </div>
        {errors.items && <p className="hc-error">{errors.items}</p>}
        <div className="hc-check-list">
          {form.items.map((item, index) => (
            <div key={item.id} className="hc-item-card">
              <div className="hc-item-toolbar">
                <strong>
                  Check {index + 1}
                  {item.section ? ` · ${item.section}` : ""}
                </strong>
                <div className="hc-row-actions">
                  <button
                    type="button"
                    className="tpm-button"
                    aria-label="Move up"
                    onClick={() => moveItem(item.id, -1)}
                    disabled={index === 0}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="tpm-button"
                    aria-label="Move down"
                    onClick={() => moveItem(item.id, 1)}
                    disabled={index === form.items.length - 1}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="tpm-button"
                    aria-label="Remove check"
                    onClick={() => {
                      if (form.items.length <= 1) return;
                      setDirty(true);
                      setForm({
                        ...form,
                        items: form.items.filter((row) => row.id !== item.id),
                      });
                    }}
                    disabled={form.items.length <= 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="hc-form-grid">
                <div className="tpm-field">
                  <label htmlFor={`title-${item.id}`}>What to check</label>
                  <input
                    id={`title-${item.id}`}
                    value={item.title}
                    onChange={(event) =>
                      updateItem(item.id, { title: event.target.value })
                    }
                    aria-invalid={!!errors[`items.${item.id}.title`]}
                    maxLength={300}
                  />
                  {errors[`items.${item.id}.title`] && (
                    <p className="hc-error">
                      {errors[`items.${item.id}.title`]}
                    </p>
                  )}
                </div>
                <div className="tpm-field">
                  <label htmlFor={`section-${item.id}`}>Section</label>
                  <input
                    id={`section-${item.id}`}
                    value={item.section}
                    onChange={(event) =>
                      updateItem(item.id, { section: event.target.value })
                    }
                    maxLength={120}
                    placeholder="Temperature"
                  />
                </div>
                <div className="tpm-field full">
                  <label htmlFor={`instructions-${item.id}`}>
                    Instructions
                  </label>
                  <textarea
                    id={`instructions-${item.id}`}
                    rows={2}
                    value={item.instructions}
                    onChange={(event) =>
                      updateItem(item.id, {
                        instructions: event.target.value,
                      })
                    }
                    maxLength={2000}
                  />
                </div>
                <div className="tpm-field">
                  <label htmlFor={`type-${item.id}`}>Result type</label>
                  <select
                    id={`type-${item.id}`}
                    value={item.responseType}
                    onChange={(event) =>
                      updateItem(item.id, {
                        responseType: event.target
                          .value as HealthCheckItem["responseType"],
                      })
                    }
                  >
                    {HEALTH_RESPONSE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                {item.responseType === "Number" && (
                  <>
                    <div className="tpm-field">
                      <label htmlFor={`unit-${item.id}`}>Unit</label>
                      <input
                        id={`unit-${item.id}`}
                        value={item.unit}
                        onChange={(event) =>
                          updateItem(item.id, { unit: event.target.value })
                        }
                        placeholder="°C"
                        maxLength={40}
                      />
                    </div>
                    <div className="tpm-field">
                      <label htmlFor={`min-${item.id}`}>
                        Acceptable min
                      </label>
                      <input
                        id={`min-${item.id}`}
                        value={item.min}
                        onChange={(event) =>
                          updateItem(item.id, { min: event.target.value })
                        }
                        maxLength={40}
                      />
                    </div>
                    <div className="tpm-field">
                      <label htmlFor={`max-${item.id}`}>
                        Acceptable max
                      </label>
                      <input
                        id={`max-${item.id}`}
                        value={item.max}
                        onChange={(event) =>
                          updateItem(item.id, { max: event.target.value })
                        }
                        maxLength={40}
                      />
                    </div>
                    {errors[`items.${item.id}.range`] && (
                      <p className="hc-error full">
                        {errors[`items.${item.id}.range`]}
                      </p>
                    )}
                  </>
                )}
                <label className="tpm-field hc-inline-field">
                  <input
                    type="checkbox"
                    checked={item.required}
                    onChange={(event) =>
                      updateItem(item.id, { required: event.target.checked })
                    }
                  />
                  <span>Required</span>
                </label>
                <label className="tpm-field hc-inline-field">
                  <input
                    type="checkbox"
                    checked={item.criticalOnFail}
                    onChange={(event) =>
                      updateItem(item.id, {
                        criticalOnFail: event.target.checked,
                      })
                    }
                  />
                  <span>Mark overall Critical when this fails</span>
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="hc-bottom-actions">
          <span aria-live="polite">
            {dirty ? "Unsaved changes" : "No unsaved changes"}
          </span>
          <div className="hc-row-actions">
            <Link href="/tpm/health-checkups" className="tpm-button">
              Cancel
            </Link>
            <button type="submit" className="tpm-button">
              Save draft
            </button>
            <button
              type="button"
              className="tpm-button primary"
              onClick={(event) => submit(event, true)}
            >
              Save & publish
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
