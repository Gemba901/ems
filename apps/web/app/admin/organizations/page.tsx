"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { PageHeader } from "@/components/patterns/PageHeader";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/patterns/ConfirmDialog";

import { TenantImage } from "@/components/files/TenantImage";
import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs.mjs";
import {
  AdminService,
  type CreateOrganizationPayload,
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
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all";


function validateSlug(value: string): string | null {
  const slug = value.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 40) {
    return "Company address must contain 3–40 characters.";
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(slug)) {
    return "Use letters, numbers and hyphens, without a leading or trailing hyphen.";
  }
  if (RESERVED_SLUGS.has(slug)) {
    return "This company address is reserved. Please choose another.";
  }
  return null;
}

function NewOrgDrawer({ open, onClose, onCreated, token }: NewOrgDrawerProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    shortName: "",
    industry: "",
    email: "",
    phone: "",
    address: "",
    logoUrl: "",
  });
  const slugError = slugTouched ? validateSlug(form.slug) : null;
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

  const [gembaSelection, setGembaSelection] = useState<string[] | null>(null);
  const { data: platformAdmins = [] } = useQuery<PlatformAdmin[]>({
    queryKey: ["platform-admins"],
    queryFn: () => AdminService.getPlatformAdmins(token),
    enabled: open,
  });

  const selectedGembaIds = gembaSelection ?? platformAdmins.map((admin) => admin.id);

  function toggleGembaUser(id: string) {
    setGembaSelection((previous) => {
      const selected = previous ?? platformAdmins.map((admin) => admin.id);
      return selected.includes(id) ? selected.filter((userId) => userId !== id) : [...selected, id];
    });
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
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : "Failed to upload logo.");
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || logoUploading) return;
    if (!form.name.trim()) {
      setError("Organization name is required.");
      return;
    }
    setSlugTouched(true);
    if (validateSlug(form.slug)) return;
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
      const payload: CreateOrganizationPayload = {
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
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
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : "Failed to create organization.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setForm({
      name: "",
      slug: "",
      shortName: "",
      industry: "",
      email: "",
      phone: "",
      address: "",
      logoUrl: "",
    });
    setSlugTouched(false);
    setAdminForm({ firstName: "", lastName: "", email: "", phone: "" });
    setAdminPhoneCountry("254");
    setShowPhonePicker(false);
    setSelectedModules([]);
    setLogoUploading(false);
    setGembaSelection(null);
    setError(null);
    onClose();
  }

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && !submitting && !logoUploading) handleClose();
    }}>
      <SheetContent showCloseButton={false} className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <SheetTitle>New Organization</SheetTitle>
            <SheetDescription>Create a new tenant on the platform</SheetDescription>
          </div>
          <Button variant="ghost" aria-label="Close" onClick={handleClose} disabled={submitting || logoUploading}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Form */}
        <form
          id="new-organization-form"
          onSubmit={handleSubmit}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6"
        >
          <Field label="Organization Name" required>
            <Input
              aria-label="Organization name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls}
              placeholder="e.g. Sunveat Food Limited"
              autoFocus
            />
          </Field>

          <Field label="Company Address" required>
            <Input
              aria-label="Company address"
              aria-describedby={slugError ? "organization-slug-help organization-slug-error" : "organization-slug-help"}
              aria-invalid={!!slugError}
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              onBlur={() => {
                set("slug", form.slug.trim().toLowerCase());
                setSlugTouched(true);
              }}
              className={inputCls}
              placeholder="e.g. sunveat"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <p id="organization-slug-help" className="mt-1 text-[11px] text-muted-foreground">
              Choose 3–40 letters, numbers or hyphens for your future workspace address.
            </p>
            {slugError && (
              <p id="organization-slug-error" role="alert" className="text-xs text-danger">
                {slugError}
              </p>
            )}
          </Field>

          <Field label="Short Name / Abbreviation">
            <Input
              aria-label="Short name"
              value={form.shortName}
              onChange={(e) => set("shortName", e.target.value.toUpperCase())}
              className={inputCls}
              placeholder="e.g. SFL (optional)"
              maxLength={10}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Used as a compact identifier. Leave blank to auto-skip.</p>
          </Field>

          <Field label="Industry">
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <NativeSelect
                aria-label="Industry"
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
              </NativeSelect>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="email"
                  aria-label="Organization email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={`${inputCls} pl-9`}
                  placeholder="info@company.com"
                />
              </div>
            </Field>

            <Field label="Phone">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="tel"
                  aria-label="Organization phone"
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
              <MapPin className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Textarea
                aria-label="Physical address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className={`${inputCls} pl-9 resize-none`}
                rows={2}
                placeholder="Physical or mailing address"
              />
            </div>
          </Field>

          <Field label="Logo URL">
            <Input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleLogoSelect}
            />
            <div className="flex flex-col gap-2">
              <Button variant="ghost"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
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
              </Button>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, or GIF. The logo preview updates automatically.
              </p>
            </div>
            {form.logoUrl && (
              <div className="flex items-center gap-2 mt-3">
                <TenantImage
                  src={form.logoUrl}
                  alt="preview"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  className="h-8 w-8 rounded object-cover border border-border"
                />
                <span className="text-[11px] text-muted-foreground">Logo preview</span>
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
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-border"
                  }`}
                >
                  <Checkbox
                    checked={selectedModules.includes(key)}
                    onCheckedChange={() => toggleModule(key)}
                  />
                  <Puzzle
                    className={`h-3.5 w-3.5 shrink-0 ${selectedModules.includes(key) ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <div>
                    <p
                      className={`text-xs font-semibold ${selectedModules.includes(key) ? "text-primary" : "text-foreground"}`}
                    >
                      {label}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{description}</p>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          {/* Section divider */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1 h-px bg-muted" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Initial Admin
            </span>
            <div className="flex-1 h-px bg-muted" />
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">
            This person will be the organization&apos;s first admin and can log in to
            onboard the rest of the team.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required>
              <Input
                aria-label="First name"
                value={adminForm.firstName}
                onChange={(e) => setAdmin("firstName", e.target.value)}
                className={inputCls}
                placeholder="Jane"
              />
            </Field>
            <Field label="Last Name" required>
              <Input
                aria-label="Last name"
                value={adminForm.lastName}
                onChange={(e) => setAdmin("lastName", e.target.value)}
                className={inputCls}
                placeholder="Doe"
              />
            </Field>
          </div>

          <Field label="Admin Email" required>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="email"
                aria-label="Admin email"
                value={adminForm.email}
                onChange={(e) => setAdmin("email", e.target.value)}
                className={`${inputCls} pl-9`}
                placeholder="admin@company.com"
              />
            </div>
          </Field>

          <Field label="Admin Phone" required>
            <div className="flex rounded-lg border border-border overflow-visible focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-primary transition-all">
              <div className="relative shrink-0">
                <Button variant="ghost"
                  type="button"
                  aria-label="Country calling code" aria-expanded={showPhonePicker}
                  onClick={() => setShowPhonePicker(v => !v)}
                  className="flex items-center gap-1 px-2.5 py-2.5 bg-muted border-r border-border text-sm font-medium text-foreground hover:bg-muted transition-colors h-full whitespace-nowrap rounded-l-lg"
                >
                  <span className="text-base leading-none">{selectedCountry.flag}</span>
                  <span className="text-muted-foreground text-xs">+{selectedCountry.code}</span>
                  <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform shrink-0 ${showPhonePicker ? "rotate-90" : ""}`} />
                </Button>
                {showPhonePicker && (
                  <div className="absolute top-full left-0 z-20 mt-1 w-44 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                    {COUNTRY_CODES.map(c => (
                      <Button variant="ghost"
                        key={c.code}
                        type="button"
                        onClick={() => { setAdminPhoneCountry(c.code); setShowPhonePicker(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors ${c.code === adminPhoneCountry ? "bg-info-subtle text-info font-semibold" : "text-foreground"}`}
                      >
                        <span>{c.flag}</span>
                        <span>+{c.code}</span>
                        <span className="text-muted-foreground ml-auto">{c.name}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                type="tel"
                aria-label="Admin phone"
                value={adminForm.phone}
                onChange={(e) => { setAdmin("phone", sanitizePhone(e.target.value)); setShowPhonePicker(false); }}
                className="flex-1 min-w-0 px-3 py-2.5 bg-card text-sm outline-none placeholder:text-muted-foreground"
                placeholder="712 345 678"
              />
            </div>
            {adminForm.phone.trim().length > 0 && (
              <p className="text-[11px] text-muted-foreground pl-1 mt-1">
                Will be stored as <span className="font-medium text-muted-foreground">{buildPhone(adminPhoneCountry, adminForm.phone)}</span>
              </p>
            )}
          </Field>

          {/* Section divider */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1 h-px bg-muted" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              GembaPMS Team
            </span>
            <div className="flex-1 h-px bg-muted" />
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">
            These existing platform super-admins will be added as employees in a
            &quot;GembaPMS&quot; department created automatically for this org.
          </p>

          <Field label="Members">
            <div className="space-y-2">
              {platformAdmins.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No existing super-admin accounts found.</p>
              )}
              {platformAdmins.map((admin) => (
                <label
                  key={admin.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                    selectedGembaIds.includes(admin.id)
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-border"
                  }`}
                >
                  <Checkbox
                    checked={selectedGembaIds.includes(admin.id)}
                    onCheckedChange={() => toggleGembaUser(admin.id)}
                  />
                  <Users
                    className={`h-3.5 w-3.5 shrink-0 ${selectedGembaIds.includes(admin.id) ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <div>
                    <p
                      className={`text-xs font-semibold ${selectedGembaIds.includes(admin.id) ? "text-primary" : "text-foreground"}`}
                    >
                      {admin.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{admin.email || admin.phone}</p>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          {error && (
            <div className="flex items-start gap-2 bg-danger-subtle border border-danger/20 text-danger text-xs rounded-lg px-3 py-2.5">
              <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/60">

          <div className="flex gap-2">
            <Button variant="ghost"
              type="button"
              onClick={handleClose}
              disabled={submitting || logoUploading}
              className="px-4 py-2 text-sm font-medium text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="new-organization-form"
              disabled={
                submitting ||
                logoUploading ||
                !form.name.trim() ||
                !adminForm.firstName.trim() ||
                !adminForm.lastName.trim() ||
                !adminForm.email.trim() ||
                !adminForm.phone.trim()
              }
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const PAGE_SIZE = 15;

const STATUS_CONFIG: Record<
  OrgStatus,
  { label: string; dot: string; badge: string }
> = {
  ACTIVE: {
    label: "Active",
    dot: "bg-success",
    badge: "bg-success/10 text-success border border-success/20",
  },
  SUSPENDED: {
    label: "Suspended",
    dot: "bg-warning",
    badge: "bg-warning/10 text-warning border border-warning/20",
  },
  INACTIVE: {
    label: "Inactive",
    dot: "bg-muted-foreground",
    badge: "bg-muted text-muted-foreground border border-border",
  },
};

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrgStatus | "">("");
  const [page, setPage] = useState(1);
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  const queryClient = useQueryClient();

  async function handleCleanOrphanUsers() {
    if (!accessToken) return;
    const result = await AdminService.deleteOrphanUsers(accessToken);
    setCleanupResult(result.message);
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

  const allOrgs = useMemo(() => data?.data ?? [], [data]);


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
        <PageHeader
          title="Organizations"
          description={isLoading ? "Loading…" : `${counts.total} organizations across the platform`}
          actions={<>
            <Button variant="destructive" onClick={() => { setCleanupResult(null); setConfirmCleanup(true); }}>
              <X /> Clean Orphan Users
            </Button>
            <Button onClick={() => setShowNewOrg(true)}>
              <Plus /> New Organization
            </Button>
          </>}
        />
        {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}
        {cleanupResult && <p role="status" className="text-sm text-success">{cleanupResult}</p>}
        <ConfirmDialog
          open={confirmCleanup}
          onOpenChange={setConfirmCleanup}
          title="Clean orphan users"
          description="Remove user accounts that have no linked employee records or organization memberships."
          destructive
          confirmLabel="Clean Orphan Users"
          onConfirm={handleCleanOrphanUsers}
        />

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
              <Button variant="ghost"
                key={key}
                aria-pressed={statusFilter === key}
                onClick={() => { setStatusFilter(key); setPage(1); }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  statusFilter === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-border"
                }`}
              >
                {label}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                    statusFilter === key
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </Button>
            ))}
          </div>
        )}

        {/* Search + table */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                aria-label="Search organizations"
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search organizations..."
                className="w-full pl-8 pr-4 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
              />
              {search && (
                <Button variant="ghost"
                  aria-label="Clear organization search"
                  onClick={() => { setSearch(""); setPage(1); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-muted-foreground" />
                </Button>
              )}
            </div>
            {!isLoading && filtered.length > 0 && (
              <p className="text-xs text-muted-foreground ml-auto">
                {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table className="w-full text-sm">
              <TableHeader className="bg-muted border-b border-border">
                <TableRow>
                  <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Organization
                  </TableHead>
                  <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Modules
                  </TableHead>
                  <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Employees
                  </TableHead>
                  <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Departments
                  </TableHead>
                  <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Suggestions
                  </TableHead>
                  <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Joined
                  </TableHead>
                  <TableHead className="px-6 py-3" />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border text-foreground">
                {isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="px-6 py-14 text-center text-muted-foreground text-sm"
                    >
                      Loading organizations...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && paginated.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="px-6 py-14 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Building2 className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-medium">
                          No organizations found
                        </p>
                        {(search || statusFilter) && (
                          <Button variant="ghost"
                            onClick={() => {
                              setSearch("");
                              setStatusFilter("");
                              setPage(1);
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            Clear filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  paginated.map((org) => {
                    const sc = STATUS_CONFIG[org.status];
                    const date = new Date(org.createdAt).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    );
                    return (
                      <TableRow
                        key={org.id}
                        className="hover:bg-muted/60 cursor-pointer group transition-colors"
                        onClick={() =>
                          router.push(`/admin/organizations/${org.id}`)
                        }
                      >
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {org.logoUrl ? (
                              <TenantImage
                                src={org.logoUrl} organizationId={org.id}
                                alt={org.name}
                                className="h-8 w-8 rounded-lg object-cover shrink-0 border border-border"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                                {org.name[0].toUpperCase()}
                              </div>
                            )}
                            <div>
                              <Link
                                href={`/admin/organizations/${org.id}`}
                                onClick={(event) => event.stopPropagation()}
                                className="font-semibold text-foreground hover:underline"
                              >
                                {org.name}
                              </Link>
                              <p className="text-[11px] text-muted-foreground">
                                {org.industry ?? "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${sc.badge}`}
                          >
                            <CircleDot className="h-2.5 w-2.5" /> {sc.label}
                          </span>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          {org.modules && org.modules.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {org.modules.map((mod) => (
                                <span
                                  key={mod}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                                >
                                  <Puzzle className="h-2.5 w-2.5" />
                                  {mod}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="px-6 py-4 tabular-nums text-muted-foreground">
                          {org._count.employees}
                        </TableCell>
                        <TableCell className="px-6 py-4 tabular-nums text-muted-foreground">
                          {org._count.departments}
                        </TableCell>
                        <TableCell className="px-6 py-4 tabular-nums text-muted-foreground">
                          {org._count.suggestions}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                          {date}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right">
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors ml-auto" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {!isLoading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost"
                  aria-label="Previous page"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2 tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button variant="ghost"
                  aria-label="Next page"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
