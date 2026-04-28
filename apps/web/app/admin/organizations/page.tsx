"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { AdminService, Organization, OrgStatus } from "@/services/admin.service";
import {
    Search, Plus, ChevronRight, ChevronLeft,
    CircleDot, Building2, X, Loader2,
    Phone, Mail, MapPin, Briefcase, ImageIcon,
} from "lucide-react";

// ── New Organization Drawer ───────────────────────────────────────────────────

interface NewOrgDrawerProps {
    open: boolean;
    onClose: () => void;
    onCreated: (org: Organization) => void;
    token: string;
}

const INDUSTRY_OPTIONS = [
    "Agriculture & Food",
    "Automotive",
    "Construction",
    "Education",
    "Energy & Utilities",
    "Finance & Banking",
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
    label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
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
        name: "", industry: "", email: "", phone: "", address: "", logoUrl: "",
    });

    function set(field: keyof typeof form, value: string) {
        setForm(prev => ({ ...prev, [field]: value }));
        setError(null);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.name.trim()) { setError("Organization name is required."); return; }

        setSubmitting(true);
        setError(null);
        try {
            const payload: Record<string, string> = { name: form.name.trim() };
            if (form.industry) payload.industry = form.industry;
            if (form.email)    payload.email    = form.email.trim();
            if (form.phone)    payload.phone    = form.phone.trim();
            if (form.address)  payload.address  = form.address.trim();
            if (form.logoUrl)  payload.logoUrl  = form.logoUrl.trim();

            const created = await AdminService.createOrganization(token, payload);
            onCreated(created);
            handleClose();
        } catch (err: any) {
            setError(err.message || "Failed to create organization.");
        } finally {
            setSubmitting(false);
        }
    }

    function handleClose() {
        setForm({ name: "", industry: "", email: "", phone: "", address: "", logoUrl: "" });
        setError(null);
        onClose();
    }

    if (!open) return null;

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex"
            onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

            {/* Drawer */}
            <div className="relative ml-auto h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">New Organization</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Create a new tenant on the platform</p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

                    <Field label="Organization Name" required>
                        <input
                            value={form.name}
                            onChange={e => set("name", e.target.value)}
                            className={inputCls}
                            placeholder="e.g. Sunveat Food Limited"
                            autoFocus
                        />
                    </Field>

                    <Field label="Industry">
                        <div className="relative">
                            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                            <select
                                value={form.industry}
                                onChange={e => set("industry", e.target.value)}
                                className={`${inputCls} pl-9 appearance-none`}
                            >
                                <option value="">Select industry...</option>
                                {INDUSTRY_OPTIONS.map(o => (
                                    <option key={o} value={o}>{o}</option>
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
                                    onChange={e => set("email", e.target.value)}
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
                                    onChange={e => set("phone", e.target.value)}
                                    className={`${inputCls} pl-9`}
                                    placeholder="+254 700 000 000"
                                />
                            </div>
                        </Field>
                    </div>

                    <Field label="Address">
                        <div className="relative">
                            <MapPin className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                            <textarea
                                value={form.address}
                                onChange={e => set("address", e.target.value)}
                                className={`${inputCls} pl-9 resize-none`}
                                rows={2}
                                placeholder="Physical or mailing address"
                            />
                        </div>
                    </Field>

                    <Field label="Logo URL">
                        <div className="relative">
                            <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                            <input
                                type="url"
                                value={form.logoUrl}
                                onChange={e => set("logoUrl", e.target.value)}
                                className={`${inputCls} pl-9`}
                                placeholder="https://..."
                            />
                        </div>
                        {form.logoUrl && (
                            <div className="flex items-center gap-2 mt-1.5">
                                <img
                                    src={form.logoUrl}
                                    alt="preview"
                                    onError={e => (e.currentTarget.style.display = "none")}
                                    className="h-8 w-8 rounded object-cover border border-slate-200"
                                />
                                <span className="text-[11px] text-slate-400">Logo preview</span>
                            </div>
                        )}
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
                        5 default roles will be created automatically.
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
                            disabled={submitting || !form.name.trim()}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                            {submitting ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating...</>
                            ) : (
                                <><Plus className="h-3.5 w-3.5" /> Create Organization</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const PAGE_SIZE = 15;

const STATUS_CONFIG: Record<OrgStatus, { label: string; dot: string; badge: string }> = {
    ACTIVE:    { label: "Active",    dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" },
    SUSPENDED: { label: "Suspended", dot: "bg-amber-500",   badge: "bg-amber-500/10 text-amber-600 border border-amber-500/20" },
    INACTIVE:  { label: "Inactive",  dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-500 border border-slate-200" },
};

export default function AdminOrganizationsPage() {
    const router       = useRouter();
    const { accessToken } = useAuthStore();

    const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState("");
    const [statusFilter, setStatusFilter] = useState<OrgStatus | "">("");
    const [page, setPage]       = useState(1);
    const [showNewOrg, setShowNewOrg] = useState(false);

    function handleOrgCreated(org: Organization) {
        setAllOrgs(prev => [org, ...prev]);
    }

    useEffect(() => {
        if (!accessToken) return;
        AdminService.listOrganizations(accessToken, 1, 500)
            .then((res) => setAllOrgs(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [accessToken]);

    useEffect(() => { setPage(1); }, [search, statusFilter]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return allOrgs.filter((o) => {
            const matchSearch = !q || o.name.toLowerCase().includes(q) || (o.industry ?? "").toLowerCase().includes(q);
            const matchStatus = !statusFilter || o.status === statusFilter;
            return matchSearch && matchStatus;
        });
    }, [allOrgs, search, statusFilter]);

    const paginated  = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    const counts = useMemo(() => ({
        total:     allOrgs.length,
        active:    allOrgs.filter((o) => o.status === "ACTIVE").length,
        suspended: allOrgs.filter((o) => o.status === "SUSPENDED").length,
        inactive:  allOrgs.filter((o) => o.status === "INACTIVE").length,
    }), [allOrgs]);

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
                        {loading ? "Loading..." : `${counts.total} organizations across the platform`}
                    </p>
                </div>
                <button
                    onClick={() => setShowNewOrg(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm self-start"
                >
                    <Plus className="h-4 w-4" /> New Organization
                </button>
            </div>

            {/* Status tabs */}
            {!loading && (
                <div className="flex items-center gap-2 flex-wrap">
                    {([
                        { key: "" as const,         label: "All",       count: counts.total },
                        { key: "ACTIVE" as const,    label: "Active",    count: counts.active },
                        { key: "SUSPENDED" as const, label: "Suspended", count: counts.suspended },
                        { key: "INACTIVE" as const,  label: "Inactive",  count: counts.inactive },
                    ]).map(({ key, label, count }) => (
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
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                                statusFilter === key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
                            }`}>{count}</span>
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
                            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                            </button>
                        )}
                    </div>
                    {!loading && filtered.length > 0 && (
                        <p className="text-xs text-slate-400 ml-auto">
                            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                        </p>
                    )}
                </div>

                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Organization</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Employees</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Departments</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Suggestions</th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Joined</th>
                            <th className="px-6 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-slate-700">
                        {loading && (
                            <tr>
                                <td colSpan={7} className="px-6 py-14 text-center text-slate-400 text-sm">
                                    Loading organizations...
                                </td>
                            </tr>
                        )}
                        {!loading && paginated.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-6 py-14 text-center">
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                        <Building2 className="h-8 w-8 text-slate-200" />
                                        <p className="text-sm font-medium">No organizations found</p>
                                        {(search || statusFilter) && (
                                            <button
                                                onClick={() => { setSearch(""); setStatusFilter(""); }}
                                                className="text-xs text-indigo-600 hover:underline"
                                            >
                                                Clear filters
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )}
                        {!loading && paginated.map((org) => {
                            const sc   = STATUS_CONFIG[org.status];
                            const date = new Date(org.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                            return (
                                <tr
                                    key={org.id}
                                    className="hover:bg-slate-50/60 cursor-pointer group transition-colors"
                                    onClick={() => router.push(`/admin/organizations/${org.id}`)}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {org.logoUrl ? (
                                                <img src={org.logoUrl} alt={org.name} className="h-8 w-8 rounded-lg object-cover shrink-0 border border-slate-100" />
                                            ) : (
                                                <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                                                    {org.name[0].toUpperCase()}
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-semibold text-slate-900">{org.name}</p>
                                                <p className="text-[11px] text-slate-400">{org.industry ?? "—"}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${sc.badge}`}>
                                            <CircleDot className="h-2.5 w-2.5" /> {sc.label}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 tabular-nums text-slate-600">{org._count.employees}</td>
                                    <td className="px-6 py-4 tabular-nums text-slate-600">{org._count.departments}</td>
                                    <td className="px-6 py-4 tabular-nums text-slate-600">{org._count.suggestions}</td>
                                    <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">{date}</td>
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
                {!loading && filtered.length > PAGE_SIZE && (
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
                            <span className="text-xs text-slate-400 px-2 tabular-nums">{page} / {totalPages}</span>
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
