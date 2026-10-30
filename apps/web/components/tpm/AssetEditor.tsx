"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useToast } from "@/contexts/toast.context";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Factory,
  ImagePlus,
  MapPin,
  Save,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useAssets } from "./AssetsProvider";
import { PreviewState } from "./AssetDetails";
import { PrimaryOperatorSelect } from "./PrimaryOperatorSelect";
import { ParentAssetPicker } from "./ParentAssetPicker";
import { assetOptionLabel } from "./asset-option-labels";
import {
  ASSET_LEVELS,
  CATEGORIES,
  ECONOMIC_IMPACT,
  HEALTH,
  OPERATING,
  USAGE,
  emptyAsset,
  nextAssetCode,
  validateAsset,
  type Asset,
  type AssetInput,
} from "./asset-preview";

export function AssetEditor({ id }: { id?: string }) {
  const { assets, loading, error } = useAssets();
  if (loading || error) return <PreviewState />;
  const asset = id ? assets.find((item) => item.id === id) : undefined;
  if (id && !asset)
    return (
      <div className="tpm-empty">
        <h1>Asset not found</h1>
        <Link href="/tpm/assets" className="tpm-button">
          Back to assets
        </Link>
      </div>
    );
  return <EditorForm key={id ?? "new"} asset={asset} />;
}

function EditorForm({ asset }: { asset?: Asset }) {
  const { assets, save } = useAssets();
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState<AssetInput>(() =>
    asset ? { ...asset, level: asset.level ?? "Equipment" } : { ...emptyAsset },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autoGenerateCode, setAutoGenerateCode] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const backHref = asset ? `/tpm/assets/${asset.id}` : "/tpm/assets";
  const locations = [
    ...new Set(assets.map((item) => item.location).filter(Boolean)),
  ];
  const teams = [...new Set(assets.map((item) => item.team).filter(Boolean))];

  function update<K extends keyof AssetInput>(key: K, value: AssetInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setDirty(true);
  }
  function cancel() {
    if (!dirty || window.confirm("Discard your unsaved asset changes?"))
      router.push(backHref);
  }
  function field(
    key: keyof AssetInput,
    label: string,
    options?: {
      placeholder?: string;
      choices?: readonly string[];
      labels?: string[];
      type?: string;
      list?: string;
      hint?: ReactNode;
      required?: boolean;
      readOnly?: boolean;
    },
  ) {
    const error = errors[key];
    const props = {
      id: `asset-${key}`,
      name: key,
      value: key === "level" ? (form.level ?? "Equipment") : form[key],
      "aria-invalid": !!error,
      "aria-describedby": error
        ? `error-${key}`
        : options?.hint
          ? `hint-${key}`
          : undefined,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
      ) => update(key, event.target.value as AssetInput[typeof key]),
    };
    return (
      <div className={`tpm-field ${error ? "has-error" : ""}`}>
        <label htmlFor={`asset-${key}`}>
          {label}
          {options?.required && <span aria-label="required"> *</span>}
        </label>
        {options?.choices ? (
          <div className="tpm-select-wrap">
            <select {...props}>
              {options.choices.map((value, index) => (
                <option value={value} key={value}>
                  {options.labels?.[index] ?? assetOptionLabel(key, value)}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </div>
        ) : (
          <input
            {...props}
            type={options?.type ?? "text"}
            placeholder={options?.placeholder}
            readOnly={options?.readOnly}
            maxLength={200}
            list={options?.list}
          />
        )}
        {error ? (
          <p className="tpm-field-error" id={`error-${key}`}>
            {error}
          </p>
        ) : (
          options?.hint && (
            <p className="tpm-field-hint" id={`hint-${key}`}>
              {options.hint}
            </p>
          )
        )}
      </div>
    );
  }
  function section(
    number: string,
    title: string,
    subtitle: string,
    icon: ReactNode,
    children: ReactNode,
  ) {
    return (
      <section className="tpm-form-section">
        <div className="tpm-section-heading">
          <span className="tpm-section-icon">{icon}</span>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <span className="tpm-section-number">{number}</span>
        </div>
        <div className="tpm-form-fields">{children}</div>
      </section>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || readingPhoto) return;
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const stage = submitter?.value === "Draft" ? "Draft" : "Registered";
    const next = {
      ...form,
      level: form.level ?? "Equipment",
      stage,
    } as AssetInput;
    const validation = validateAsset(
      {
        ...next,
        code:
          asset?.code ?? (autoGenerateCode ? nextAssetCode(assets) : next.code),
      },
      assets,
      asset?.id,
    );
    setErrors(validation);
    setSaveError("");
    if (Object.keys(validation).length) {
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>(
            "[aria-invalid=true], [data-invalid=true]",
          )
          ?.focus(),
      );
      return;
    }
    setSaving(true);
    try {
      const saved = save(
        { ...next, code: !asset && autoGenerateCode ? "" : next.code },
        asset?.id,
        { autoGenerateCode },
      );
      toast(
        asset
          ? "Asset updated successfully"
          : saved.stage === "Draft"
            ? "Asset saved as draft"
            : "Asset created successfully",
        "success",
      );
      router.push(`/tpm/assets/${saved.id}`);
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Could not save this asset. Please try again.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="tpm-editor">
      <button className="tpm-back-link" onClick={cancel}>
        <ArrowLeft size={15} />
        {asset ? "Back to asset" : "All assets"}
      </button>
      <header className="tpm-page-heading">
        <div>
          <div className="tpm-eyebrow">
            TPM <span>/</span> Assets <span>/</span>{" "}
            {asset ? "Edit" : "New asset"}
          </div>
          <h1>{asset ? "Edit asset" : "Add a new asset"}</h1>
          <p>
            Give your equipment a place, a purpose and a person responsible.
          </p>
        </div>
        <span className="tpm-form-step">
          Step 01 <span>Equipment register</span>
        </span>
      </header>
      <form onSubmit={submit} noValidate ref={formRef}>
        <div className="tpm-editor-grid">
          <div className="tpm-form-content">
            {section(
              "01",
              "Asset information",
              "Start with the details that make this equipment easy to find.",
              <Factory size={19} />,
              <>
                <div className="tpm-photo-upload">
                  <button
                    type="button"
                    className={`tpm-photo-target ${form.photo ? "has-photo" : ""}`}
                    onClick={() => photoInput.current?.click()}
                    aria-label="Choose asset photo"
                  >
                    {form.photo ? (
                      <Image
                        src={form.photo}
                        width={96}
                        height={96}
                        alt="Selected asset photo"
                        unoptimized
                      />
                    ) : (
                      <ImagePlus size={27} strokeWidth={1.4} />
                    )}
                  </button>
                  <div>
                    <strong>
                      Asset photo <span>Optional</span>
                    </strong>
                    <p>Help your team recognize the right machine.</p>
                    <button
                      type="button"
                      className="tpm-text-button"
                      onClick={() => photoInput.current?.click()}
                      disabled={readingPhoto}
                    >
                      {readingPhoto
                        ? "Reading photo…"
                        : form.photo
                          ? "Change photo"
                          : "Choose photo"}
                    </button>
                    <small>JPG, PNG or WebP · Up to 1 MB</small>
                    {errors.photo && (
                      <p className="tpm-field-error" role="alert">
                        {errors.photo}
                      </p>
                    )}
                  </div>
                  {form.photo && (
                    <button
                      type="button"
                      className="tpm-icon-button"
                      aria-label="Remove photo"
                      onClick={() => update("photo", "")}
                    >
                      <X size={15} />
                    </button>
                  )}
                  <input
                    ref={photoInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    aria-label="Asset photo file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (
                        !["image/jpeg", "image/png", "image/webp"].includes(
                          file.type,
                        ) ||
                        file.size > 1024 * 1024
                      ) {
                        setErrors((current) => ({
                          ...current,
                          photo:
                            "Choose a JPG, PNG or WebP image smaller than 1 MB.",
                        }));
                        return;
                      }
                      setReadingPhoto(true);
                      const reader = new FileReader();
                      reader.onload = () => {
                        update("photo", String(reader.result));
                        setReadingPhoto(false);
                      };
                      reader.onerror = () => {
                        setErrors((current) => ({
                          ...current,
                          photo:
                            "This image could not be read. Try another file.",
                        }));
                        setReadingPhoto(false);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </div>
                <div className="tpm-form-two">
                  {field("name", "Asset name", {
                    placeholder: "e.g. Flour Automation",
                    required: true,
                  })}
                  <div
                    className={`tpm-field ${errors.code ? "has-error" : ""}`}
                  >
                    <div className="tpm-asset-code-heading">
                      <label htmlFor="asset-code">
                        Asset code
                        {!asset && !autoGenerateCode && (
                          <span aria-label="required"> *</span>
                        )}
                      </label>
                      {!asset && (
                        <label className="tpm-asset-code-toggle">
                          <span>Auto-generate</span>
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label="Auto-generate asset code"
                            checked={autoGenerateCode}
                            onChange={(event) => {
                              setAutoGenerateCode(event.target.checked);
                              setErrors((current) => ({
                                ...current,
                                code: "",
                              }));
                              setSaveError("");
                              setDirty(true);
                            }}
                          />
                          <span
                            className="tpm-asset-code-switch"
                            aria-hidden="true"
                          />
                        </label>
                      )}
                    </div>
                    <input
                      id="asset-code"
                      name="code"
                      value={!asset && autoGenerateCode ? "" : form.code}
                      readOnly={!!asset || autoGenerateCode}
                      required={!asset && !autoGenerateCode}
                      aria-invalid={!!errors.code}
                      aria-describedby={
                        errors.code ? "error-code" : "hint-code"
                      }
                      placeholder={
                        autoGenerateCode
                          ? "Assigned when saved"
                          : "e.g. IMM-001"
                      }
                      maxLength={200}
                      onChange={(event) => update("code", event.target.value)}
                    />
                    {errors.code ? (
                      <p className="tpm-field-error" id="error-code">
                        {errors.code}
                      </p>
                    ) : (
                      <p className="tpm-field-hint" id="hint-code">
                        {asset
                          ? "This asset's code is fixed after creation."
                          : autoGenerateCode
                            ? "A unique asset code will be assigned when you save."
                            : "Enter a unique code for this asset."}
                      </p>
                    )}
                  </div>
                </div>
                <div className="tpm-form-two">
                  {field("category", "Equipment category", {
                    choices: ["", ...CATEGORIES],
                    labels: ["Select a category", ...CATEGORIES],
                    required: true,
                  })}
                  {field("purpose", "Type / use", {
                    placeholder: "e.g. Injection moulding",
                    hint: (
                      <span className="tpm-field-help">
                        <CircleAlert size={14} aria-hidden="true" />
                        <span>
                          Describe what this asset is used for, e.g. injection
                          moulding, material mixing, or cooling.
                        </span>
                      </span>
                    ),
                  })}
                </div>
                <div className="tpm-field">
                  <label htmlFor="asset-description">
                    Description <span className="tpm-optional">Optional</span>
                  </label>
                  <textarea
                    id="asset-description"
                    value={form.description}
                    onChange={(event) =>
                      update("description", event.target.value)
                    }
                    maxLength={4000}
                    rows={3}
                    placeholder="What does this equipment do? Add identifying details or context for your team."
                  />
                </div>
              </>,
            )}
            {section(
              "02",
              "Location & hierarchy",
              "Place this asset within your plant and production area.",
              <MapPin size={19} />,
              <>
                <div className="tpm-form-two">
                  {field("site", "Plant / site", {
                    placeholder: "e.g. Main plant",
                  })}
                  {field("department", "Department", {
                    placeholder: "e.g. Production",
                  })}
                </div>
                <div className="tpm-form-two">
                  {field("level", "Asset level", {
                    choices: ASSET_LEVELS,
                    hint: "Choose the type of position this asset has in your hierarchy.",
                  })}
                  <ParentAssetPicker
                    assets={assets}
                    value={form.parentId}
                    editingId={asset?.id}
                    onChange={(id) => update("parentId", id)}
                    error={errors.parentId}
                  />
                </div>
                {field("location", "Workplace / Gemba", {
                  placeholder: "e.g. Mixing",
                  list: "tpm-locations",
                  required: true,
                })}
                <datalist id="tpm-locations">
                  {locations.map((location) => (
                    <option key={location}>{location}</option>
                  ))}
                </datalist>
              </>,
            )}
            {section(
              "03",
              "Condition & importance",
              "Capture how the machine is used and how critical it is.",
              <ShieldCheck size={19} />,
              <>
                <fieldset className="tpm-criticality-picker">
                  <legend>Equipment criticality</legend>
                  {(["A", "B", "C"] as const).map((value, index) => (
                    <label
                      key={value}
                      className={form.criticality === value ? "selected" : ""}
                    >
                      <input
                        type="radio"
                        name="criticality"
                        value={value}
                        checked={form.criticality === value}
                        aria-label={assetOptionLabel("criticality", value)}
                        onChange={() => update("criticality", value)}
                      />
                      <span
                        className={`tpm-criticality-letter ${value.toLowerCase()}`}
                      >
                        {value}
                      </span>
                      <span>
                        <strong>
                          {assetOptionLabel("criticality", value).slice(4)}
                        </strong>
                        <small>
                          {
                            [
                              "Key process or major impact",
                              "Partial disruption",
                              "Limited operational impact",
                            ][index]
                          }
                        </small>
                      </span>
                      {form.criticality === value && <Check size={15} />}
                    </label>
                  ))}
                </fieldset>
                <div className="tpm-form-two">
                  {field("usage", "Usage status", { choices: USAGE })}
                  {field("health", "Equipment health", { choices: HEALTH })}
                </div>
                <div className="tpm-form-two">
                  {field("operating", "Current operating status", {
                    choices: OPERATING,
                  })}
                  {field("economicImpact", "Economic impact", {
                    choices: ECONOMIC_IMPACT,
                  })}
                </div>
              </>,
            )}
            {section(
              "04",
              "People & responsibility",
              "Make ownership clear from the first day.",
              <Users size={19} />,
              <>
                <div className="tpm-form-two">
                  <PrimaryOperatorSelect
                    operatorId={form.operatorId}
                    operatorName={form.operator}
                    onChange={(operatorId, operator) => {
                      setForm((current) => ({
                        ...current,
                        operatorId,
                        operator,
                      }));
                      setDirty(true);
                    }}
                  />
                  {field("backupOperator", "Backup operator", {
                    placeholder: "Optional backup",
                  })}
                </div>
                <div className="tpm-form-two">
                  {field("maintenanceOwner", "Maintenance owner", {
                    placeholder: "Responsible technician / supervisor",
                  })}
                  {field("team", "Maintenance team", {
                    placeholder: "e.g. Mechanical maintenance",
                    list: "tpm-teams",
                    hint: "Assign a team or maintenance owner to register.",
                  })}
                </div>
                <datalist id="tpm-teams">
                  {teams.map((team) => (
                    <option key={team}>{team}</option>
                  ))}
                </datalist>
              </>,
            )}
            <details
              className="tpm-form-section tpm-technical-section"
              open={!!errors.warrantyUntil}
            >
              <summary>
                <span className="tpm-section-icon">
                  <Settings2 size={19} />
                </span>
                <span>
                  <strong>Technical details & notes</strong>
                  <small>
                    Manufacturer, specifications and reference information
                  </small>
                </span>
                <span className="tpm-optional">Optional</span>
                <ChevronDown size={17} />
              </summary>
              <div className="tpm-form-fields">
                <div className="tpm-form-two">
                  {field("manufacturer", "Manufacturer", {
                    placeholder: "Manufacturer name",
                  })}
                  {field("model", "Model", { placeholder: "Model / series" })}
                </div>
                <div className="tpm-form-two">
                  {field("serialNumber", "Serial number", {
                    placeholder: "Nameplate serial number",
                  })}
                  {field("capacity", "Capacity / rating", {
                    placeholder: "e.g. 500 kg / hour",
                  })}
                </div>
                <div className="tpm-form-two">
                  {field("installedOn", "Installation date", { type: "date" })}
                  {field("warrantyUntil", "Warranty expiry", { type: "date" })}
                </div>
                <div className="tpm-field">
                  <label htmlFor="asset-notes">Reference notes</label>
                  <textarea
                    id="asset-notes"
                    value={form.notes}
                    onChange={(event) => update("notes", event.target.value)}
                    maxLength={4000}
                    rows={4}
                    placeholder="Useful operating instructions, service information or notes…"
                  />
                </div>
              </div>
            </details>
          </div>
          <aside className="tpm-form-guide">
            <span className="tpm-overline">A good record starts here</span>
            <h2>
              One asset.
              <br />
              One source of context.
            </h2>
            <p>
              Start with the essentials. Add more detail as your equipment
              register grows.
            </p>
            <ol>
              <li>
                <Check size={14} />
                <span>
                  <strong>Easy to identify</strong>Clear name, unique code and a
                  photo.
                </span>
              </li>
              <li>
                <Check size={14} />
                <span>
                  <strong>Easy to locate</strong>Plant, workplace and parent
                  equipment.
                </span>
              </li>
              <li>
                <Check size={14} />
                <span>
                  <strong>Clear ownership</strong>An operator and maintenance
                  contact.
                </span>
              </li>
            </ol>
            <div className="tpm-guide-divider" />
            <span className="tpm-overline">Coming next</span>
            <p>
              Attach daily checks and PM plans. Future maintenance records will
              build this asset’s history.
            </p>
            <div className="tpm-guide-draft">
              <Save size={17} />
              <span>
                Missing some details?
                <br />
                <strong>Save a draft and finish later.</strong>
              </span>
            </div>
          </aside>
        </div>
        <div className="tpm-form-footer">
          {saveError && (
            <p className="tpm-save-error" role="alert">
              {saveError}
            </p>
          )}
          <div>
            <span className="tpm-save-caption">
              {dirty ? "Unsaved changes" : "Preview · Saved on this device"}
            </span>
            <div className="tpm-actions">
              <button
                type="button"
                className="tpm-button"
                onClick={cancel}
                disabled={saving}
              >
                Cancel
              </button>
              {(!asset || asset.stage === "Draft") && (
                <button
                  type="submit"
                  name="action"
                  value="Draft"
                  className="tpm-button"
                  disabled={saving || readingPhoto}
                >
                  <Save size={15} />
                  Save draft
                </button>
              )}
              <button
                type="submit"
                name="action"
                value="Registered"
                className="tpm-button primary"
                disabled={saving || readingPhoto}
              >
                {saving ? "Saving…" : asset ? "Save changes" : "Create asset"}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
