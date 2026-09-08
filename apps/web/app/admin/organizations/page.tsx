"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import {
  AdminService,
  Organization,
  OrgStatus,
  ModuleType,
  AVAILABLE_MODULES,
  PlatformAdmin,
} from "@/services/admin.service";
import { uploadImage } from "@/services/uploads.service";
import {
  Search,
  Plus,
  ChevronRight,
  ChevronLeft,
  CircleDot,
  Building2,
  X,
  Loader2,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  ImageIcon,
  Puzzle,
  Users,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// ── New Organization Drawer ───────────────────────────────────────────────────

interface NewOrgDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  token: string;
}

const COUNTRY_CODES = [
  { code: "254", flag: "🇰🇪", name: "Kenya" },
  { code: "255", flag: "🇹🇿", name: "Tanzania" },
  { code: "256", flag: "🇺🇬", name: "Uganda" },
  { code: "250", flag: "🇷🇼", name: "Rwanda" },
  { code: "251", flag: "🇪🇹", name: "Ethiopia" },
  { code: "91",  flag: "🇮🇳", name: "India" },
];

function sanitizePhone(raw: string): string {
  return raw.replace(/^\+/, "").replace(/[\s\-()]/g, "");
}

function buildPhone(countryCode: string, local: string): string {
  const digits = sanitizePhone(local).replace(/^0/, "");
  if (digits.startsWith(countryCode)) return digits;
  return `${countryCode}${digits}`;
}

const INDUSTRY_OPTIONS = [
  "Agriculture & Food",
  "Automotive",
  "Construction",
  "System Development",
  "Education",
  "Energy & Utilities",
  "Finance & Banking",
  "Food & Beverage",
  "Healthcare",
  "Hospitality & Tourism",
  "Information Technology",
  "Logistics & Transport",
  "Manufacturing",
  "Media & Entertainment",
  "Retail & E-commerce",
  "Telecommunications",
  "Other",
];

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all";

function NewOrgDrawer({ open, onClose, onCreated, token }: NewOrgDrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    shortName: "",
    industry: "",
    email: "",
    phone: "",
    address: "",
    logoUrl: "",
  });
  const [adminForm, setAdminForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [adminPhoneCountry, setAdminPhoneCountry] = useState("254");
  const [showPhonePicker, setShowPhonePicker] = useState(false);
  const [selectedModules, setSelectedModules] = useState<ModuleType[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedCountry = COUNTRY_CODES.find(c => c.code === adminPhoneCountry) ?? COUNTRY_CODES[0];

  const [selectedGembaIds, setSelectedGembaIds] = useState<string[]>([]);
  const [gembaTouched, setGembaTouched] = useState(false);
  const { data: platformAdmins = [] } = useQuery<PlatformAdmin[]>({
    queryKey: ["platform-admins"],
    queryFn: () => AdminService.getPlatformAdmins(token),
    enabled: open,
  });

  useEffect(() => {
    if (open && platformAdmins.length > 0 && !gembaTouched) {
      setSelectedGembaIds(platformAdmins.map((u) => u.id));
    }
  }, [open, platformAdmins, gembaTouched]);

  function toggleGembaUser(id: string) {
    setGembaTouched(true);
    setSelectedGembaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function setAdmin(field: keyof typeof adminForm, value: string) {
    setAdminForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function toggleModule(mod: ModuleType) {
    setSelectedModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  }

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);
    setError(null);

    try {
      const { fileUrl } = await uploadImage(file, "logos", token);
      set("logoUrl", fileUrl);
    } catch (err: any) {
      setError(err.message || "Failed to upload logo.");
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Organization name is required.");
      return;
    }
    if (!adminForm.firstName.trim()) {
      setError("Admin first name is required.");
      return;
    }
    if (!adminForm.lastName.trim()) {
      setError("Admin last name is required.");
      return;
    }
    if (!adminForm.email.trim()) {
      setError("Admin email is required.");
      return;
    }
    if (!adminForm.phone.trim()) {
      setError("Admin phone is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, string> & {
        modules?: ModuleType[];
        adminFirstName: string;
        adminLastName: string;
        adminEmail: string;
        adminPhone: string;
        gembaTeamUserIds?: string[];
      } = {
        name: form.name.trim(),
        adminFirstName: adminForm.firstName.trim(),
        adminLastName: adminForm.lastName.trim(),
        adminEmail: adminForm.email.trim(),
        adminPhone: buildPhone(adminPhoneCountry, adminForm.phone),
      };
      if (form.shortName) payload.shortName = form.shortName.trim().toUpperCase();
      if (form.industry) payload.industry = form.industry;
      if (form.email) payload.email = form.email.trim();
      if (form.phone) payload.phone = sanitizePhone(form.phone.trim());
      if (form.address) payload.address = form.address.trim();
      if (form.logoUrl) payload.logoUrl = form.logoUrl.trim();
      payload.modules = selectedModules;
      payload.gembaTeamUserIds = selectedGembaIds;

      await AdminService.createOrganization(token, payload);
      onCreated();
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to create organization.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setForm({
      name: "",
      shortName: "",
      industry: "",
      email: "",
      phone: "",
      address: "",
      logoUrl: "",
    });
    setAdminForm({ firstName: "", lastName: "", email: "", phone: "" });
    setAdminPhoneCountry("254");
    setShowPhonePicker(false);
    setSelectedModules([]);
    setLogoUploading(false);
    setSelectedGembaIds([]);
    setGembaTouched(false);
    setError(null);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex"
      onClick={(e) => {
        if (e.target === overlayRef.current) handleClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

      {/* Drawer */}
      <div className="relative ml-auto h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              New Organization
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Create a new tenant on the platform
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-6 space-y-5"
        >
          <Field label="Organization Name" required>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls}
              placeholder="e.g. Sunveat Food Limited"
              autoFocus
            />
          </Field>

          <Field label="Short Name / Abbreviation">
            <input
              value={form.shortName}
              onChange={(e) => set("shortName", e.target.value.toUpperCase())}
              className={inputCls}
              placeholder="e.g. SFL (optional)"
              maxLength={10}
            />
            <p className="mt-1 text-[11px] text-slate-400">Used as a compact identifier. Leave blank to auto-skip.</p>
          </Field>

          <Field label="Industry">
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={form.industry}
                onChange={(e) => set("industry", e.target.value)}
                className={`${inputCls} pl-9 appearance-none`}
              >
                <option value="">Select industry...</option>
                {INDUSTRY_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={`${inputCls} pl-9`}
                  placeholder="info@company.com"
                />
              </div>
            </Field>

            <Field label="Phone">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", sanitizePhone(e.target.value))}
                  className={`${inputCls} pl-9`}
                  placeholder="254700000000"
                />
              </div>
            </Field>
          </div>

          <Field label="Address">
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <textarea
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className={`${inputCls} pl-9 resize-none`}
                rows={2}
                placeholder="Physical or mailing address"
              />
            </div>
          </Field>

          <Field label="Logo URL">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleLogoSelect}
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {logoUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
                {logoUploading
                  ? "Uploading logo…"
                  : form.logoUrl
                    ? "Replace logo"
                    : "Upload logo"}
              </button>
              <p className="text-xs text-slate-400">
                PNG, JPG, or GIF. The logo preview updates automatically.
              </p>
            </div>
            {form.logoUrl && (
              <div className="flex items-center gap-2 mt-3">
                <img
                  src={form.logoUrl}
                  alt="preview"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  className="h-8 w-8 rounded object-cover border border-slate-200"
                />
                <span className="text-[11px] text-slate-400">Logo preview</span>
              </div>
            )}
          </Field>

          <Field label="Modules">
            <div className="space-y-2">
              {AVAILABLE_MODULES.map(({ key, label, description }) => (
                <label
                  key={key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                    selectedModules.includes(key)
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedModules.includes(key)}
                    onChange={() => toggleModule(key)}
                    className="h-3.5 w-3.5 accent-indigo-600"
                  />
                  <Puzzle
                    className={`h-3.5 w-3.5 shrink-0 ${selectedModules.includes(key) ? "text-indigo-600" : "text-slate-400"}`}
                  />
                  <div>
                    <p
                      className={`text-xs font-semibold ${selectedModules.includes(key) ? "text-indigo-700" : "text-slate-700"}`}
                    >
                      {label}
                    </p>
                    <p className="text-[11px] text-slate-400">{description}</p>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          {/* Section divider */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Initial Admin
            </span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>
          <p className="text-[11px] text-slate-400 -mt-2">
            This person will be the organization's first admin and can log in to
            onboard the rest of the team.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required>
              <input
                value={adminForm.firstName}
                onChange={(e) => setAdmin("firstName", e.target.value)}
                className={inputCls}
                placeholder="Jane"
              />
            </Field>
            <Field label="Last Name" required>
              <input
                value={adminForm.lastName}
                onChange={(e) => setAdmin("lastName", e.target.value)}
                className={inputCls}
                placeholder="Doe"
              />
            </Field>
          </div>

          <Field label="Admin Email" required>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="email"
                value={adminForm.email}
                onChange={(e) => setAdmin("email", e.target.value)}
                className={`${inputCls} pl-9`}
                placeholder="admin@company.com"
              />
            </div>
          </Field>

          <Field label="Admin Phone" required>
            <div className="flex rounded-lg border border-slate-200 overflow-visible focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPhonePicker(v => !v)}
                  className="flex items-center gap-1 px-2.5 py-2.5 bg-slate-50 border-r border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors h-full whitespace-nowrap rounded-l-lg"
                >
                  <span className="text-base leading-none">{selectedCountry.flag}</span>
                  <span className="text-slate-500 text-xs">+{selectedCountry.code}</span>
                  <ChevronRight className={`h-3 w-3 text-slate-400 transition-transform shrink-0 ${showPhonePicker ? "rotate-90" : ""}`} />
                </button>
                {showPhonePicker && (
                  <div className="absolute top-full left-0 z-20 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                    {COUNTRY_CODES.map(c => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => { setAdminPhoneCountry(c.code); setShowPhonePicker(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${c.code === adminPhoneCountry ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700"}`}
                      >
                        <span>{c.flag}</span>
                        <span>+{c.code}</span>
                        <span className="text-slate-400 ml-auto">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="tel"
                value={adminForm.phone}
                onChange={(e) => { setAdmin("phone", sanitizePhone(e.target.value)); setShowPhonePicker(false); }}
                className="flex-1 min-w-0 px-3 py-2.5 bg-white text-sm outline-none placeholder:text-slate-400"
                placeholder="712 345 678"
              />
            </div>
            {adminForm.phone.trim().length > 0 && (
              <p className="text-[11px] text-slate-400 pl-1 mt-1">
                Will be stored as <span className="font-medium text-slate-600">{buildPhone(adminPhoneCountry, adminForm.phone)}</span>
              </p>
            )}
          </Field>

          {/* Section divider */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              GembaPMS Team
            </span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>
          <p className="text-[11px] text-slate-400 -mt-2">
            These existing platform super-admins will be added as employees in a
            "GembaPMS" department created automatically for this org.
          </p>

          <Field label="Members">
            <div className="space-y-2">
              {platformAdmins.length === 0 && (
                <p className="text-xs text-slate-400 italic">No existing super-admin accounts found.</p>
              )}
              {platformAdmins.map((admin) => (
                <label
                  key={admin.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                    selectedGembaIds.includes(admin.id)
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedGembaIds.includes(admin.id)}
                    onChange={() => toggleGembaUser(admin.id)}
                    className="h-3.5 w-3.5 accent-indigo-600"
                  />
                  <Users
                    className={`h-3.5 w-3.5 shrink-0 ${selectedGembaIds.includes(admin.id) ? "text-indigo-600" : "text-slate-400"}`}
                  />
                  <div>
                    <p
                      className={`text-xs font-semibold ${selectedGembaIds.includes(admin.id) ? "text-indigo-700" : "text-slate-700"}`}
                    >
                      {admin.name}
                    </p>
                    <p className="text-[11px] text-slate-400">{admin.email || admin.phone}</p>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2.5">
              <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <p className="text-[11px] text-slate-400">
            Org + admin account created atomically.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                submitting ||
                logoUploading ||
                !form.name.trim() ||
                !adminForm.firstName.trim() ||
                !adminForm.lastName.trim() ||
                !adminForm.email.trim() ||
                !adminForm.phone.trim()
              }
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating...
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> Create Organization
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 15;

const STATUS_CONFIG: Record<
  OrgStatus,
  { label: string; dot: string; badge: string }
> = {
  ACTIVE: {
    label: "Active",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
  },
  SUSPENDED: {
    label: "Suspended",
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
  },
  INACTIVE: {
    label: "Inactive",
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-500 border border-slate-200",
  },
};

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrgStatus | "">("");
  const [page, setPage] = useState(1);
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);

  const queryClient = useQueryClient();

  async function handleCleanOrphanUsers() {
    if (!accessToken) return;
    setCleaningOrphans(true);
    try {
      const result = await AdminService.deleteOrphanUsers(accessToken);
      alert(result.message);
    } catch (err: any) {
      alert(err?.message ?? "Cleanup failed");
    } finally {
      setCleaningOrphans(false);
    }
  }


  function handleOrgCreated() {
  queryClient.invalidateQueries({ queryKey: ["organizations"] });
  setShowNewOrg(false);
}


  const { data, isLoading, error } = useQuery({
    queryKey: ["organizations", page],
    queryFn: () => AdminService.listOrganizations(accessToken!, page, 20),
    enabled: !!accessToken,
  });

  const allOrgs = data?.data ?? [];


  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allOrgs.filter((o) => {
      const matchSearch =
        !q ||
        o.name.toLowerCase().includes(q) ||
        (o.industry ?? "").toLowerCase().includes(q);
      const matchStatus = !statusFilter || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [allOrgs, search, statusFilter]);

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const counts = useMemo(
    () => ({
      total: allOrgs.length,
      active: allOrgs.filter((o) => o.status === "ACTIVE").length,
      suspended: allOrgs.filter((o) => o.status === "SUSPENDED").length,
      inactive: allOrgs.filter((o) => o.status === "INACTIVE").length,
    }),
    [allOrgs],
  );

  return (
    <>
      <NewOrgDrawer
        open={showNewOrg}
        onClose={() => setShowNewOrg(false)}
        onCreated={handleOrgCreated}
        token={accessToken!}
      />

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Organizations</h1>
            <p className="text-sm text-slate-500 mt-1">
              {isLoading
                ? "Loading..."
                : `${counts.total} organizations across the platform`}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button
              onClick={handleCleanOrphanUsers}
              disabled={cleaningOrphans}
              className="flex items-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
              title="Remove user accounts that have no linked employees or org memberships"
            >
              {cleaningOrphans ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Clean Orphan Users
            </button>
            <button
              onClick={() => setShowNewOrg(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" /> New Organization
            </button>
          </div>
        </div>

        {/* Status tabs */}
        {!isLoading && (
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: "" as const, label: "All", count: counts.total },
              { key: "ACTIVE" as const, label: "Active", count: counts.active },
              {
                key: "SUSPENDED" as const,
                label: "Suspended",
                count: counts.suspended,
              },
              {
                key: "INACTIVE" as const,
                label: "Inactive",
                count: counts.inactive,
              },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  statusFilter === key
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                {label}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                    statusFilter === key
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Search + table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search organizations..."
                className="w-full pl-8 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>
            {!isLoading && filtered.length > 0 && (
              <p className="text-xs text-slate-400 ml-auto">
                {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Organization
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Modules
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Employees
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Departments
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Suggestions
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-700">
                {isLoading && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-14 text-center text-slate-400 text-sm"
                    >
                      Loading organizations...
                    </td>
                  </tr>
                )}
                {!isLoading && paginated.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Building2 className="h-8 w-8 text-slate-200" />
                        <p className="text-sm font-medium">
                          No organizations found
                        </p>
                        {(search || statusFilter) && (
                          <button
                            onClick={() => {
                              setSearch("");
                              setStatusFilter("");
                            }}
                            className="text-xs text-indigo-600 hover:underline"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  paginated.map((org) => {
                    const sc = STATUS_CONFIG[org.status];
                    const date = new Date(org.createdAt).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    );
                    return (
                      <tr
                        key={org.id}
                        className="hover:bg-slate-50/60 cursor-pointer group transition-colors"
                        onClick={() =>
                          router.push(`/admin/organizations/${org.id}`)
                        }
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {org.logoUrl ? (
                              <img
                                src={org.logoUrl}
                                alt={org.name}
                                className="h-8 w-8 rounded-lg object-cover shrink-0 border border-slate-100"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                                {org.name[0].toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-slate-900">
                                {org.name}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {org.industry ?? "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${sc.badge}`}
                          >
                            <CircleDot className="h-2.5 w-2.5" /> {sc.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {org.modules && org.modules.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {org.modules.map((mod) => (
                                <span
                                  key={mod}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200"
                                >
                                  <Puzzle className="h-2.5 w-2.5" />
                                  {mod}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-300">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 tabular-nums text-slate-600">
                          {org._count.employees}
                        </td>
                        <td className="px-6 py-4 tabular-nums text-slate-600">
                          {org._count.departments}
                        </td>
                        <td className="px-6 py-4 tabular-nums text-slate-600">
                          {org._count.suggestions}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                          {date}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors ml-auto" />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-slate-400 px-2 tabular-nums">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
