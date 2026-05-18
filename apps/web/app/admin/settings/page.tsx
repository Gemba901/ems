"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";
import { AdminService, type Organization } from "@/services/admin.service";
import {
    Palette, Check, Loader2, Building2, ShieldCheck, Search,
} from "lucide-react";

const PRESET_COLORS = [
    { label: "Indigo",   value: "#4F46E5" },
    { label: "Blue",     value: "#2563EB" },
    { label: "Violet",   value: "#7C3AED" },
    { label: "Rose",     value: "#E11D48" },
    { label: "Emerald",  value: "#059669" },
    { label: "Amber",    value: "#D97706" },
    { label: "Sky",      value: "#0284C7" },
    { label: "Slate",    value: "#475569" },
];

export default function AdminSettingsPage() {
    const { accessToken } = useAuthStore();

    // Brand color
    const [currentColor, setCurrentColor] = useState("#4F46E5");
    const [selected, setSelected]         = useState("#4F46E5");
    const [custom, setCustom]             = useState("");
    const [saving, setSaving]             = useState(false);
    const [saved, setSaved]               = useState(false);
    const [colorError, setColorError]     = useState<string | null>(null);

    // Platform identity
    const [orgs, setOrgs]                     = useState<Organization[]>([]);
    const [orgsLoading, setOrgsLoading]       = useState(true);
    const [adminOrgId, setAdminOrgId]         = useState<string | null>(null);
    const [pendingOrgId, setPendingOrgId]     = useState<string | null>(null);
    const [search, setSearch]                 = useState("");
    const [settingAdmin, setSettingAdmin]     = useState(false);
    const [adminSaved, setAdminSaved]         = useState(false);
    const [adminError, setAdminError]         = useState<string | null>(null);

    useEffect(() => {
        if (!accessToken) return;

        // Load own org color
        AuthService.getMyOrg(accessToken)
            .then((org) => {
                const o = org as any;
                const color = o.primaryColor ?? "#4F46E5";
                setCurrentColor(color);
                setSelected(color);
                if (!PRESET_COLORS.find(p => p.value === color)) setCustom(color);
            })
            .catch(console.error);

        // Load all orgs
        AdminService.listOrganizations(accessToken, 1, 200)
            .then(({ data }) => {
                setOrgs(data);
                const current = data.find(o => o.isAdminOrg);
                if (current) {
                    setAdminOrgId(current.id);
                    setPendingOrgId(current.id);
                }
            })
            .catch(console.error)
            .finally(() => setOrgsLoading(false));
    }, [accessToken]);

    const activeColor = custom || selected;

    const handleSetAdminOrg = async () => {
        if (!accessToken || !pendingOrgId || pendingOrgId === adminOrgId) return;
        setSettingAdmin(true);
        setAdminError(null);
        try {
            await AdminService.setAdminOrg(accessToken, pendingOrgId);
            setAdminOrgId(pendingOrgId);
            setOrgs(prev => prev.map(o => ({ ...o, isAdminOrg: o.id === pendingOrgId })));
            setAdminSaved(true);
            setTimeout(() => setAdminSaved(false), 3000);
        } catch (e: any) {
            setAdminError(e.message || "Failed to set platform company");
        } finally {
            setSettingAdmin(false);
        }
    };

    const handleSaveColor = async () => {
        if (!accessToken) return;
        setSaving(true);
        setColorError(null);
        setSaved(false);
        try {
            await AdminService.updateCompanyTheme(accessToken, activeColor);
            setCurrentColor(activeColor);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e: any) {
            setColorError(e.message || "Failed to save theme");
        } finally {
            setSaving(false);
        }
    };

    const filtered = orgs.filter(o =>
        o.name.toLowerCase().includes(search.toLowerCase())
    );

    const currentAdminOrg = orgs.find(o => o.id === adminOrgId);
    const pendingOrg      = orgs.find(o => o.id === pendingOrgId);
    const hasChange       = pendingOrgId !== adminOrgId;

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Platform Settings</h1>
                <p className="text-sm text-slate-500 mt-1">Manage the platform company designation and appearance.</p>
            </div>

            {/* ── Platform Identity ──────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-indigo-50">
                        <Building2 className="h-3.5 w-3.5 text-indigo-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">Platform Company</p>
                </div>
                <div className="p-6 space-y-5">
                    <p className="text-sm text-slate-500">
                        The <span className="font-semibold text-slate-700">platform company</span> is the consultancy
                        that owns and operates this system. Designating an organization here controls how the Calendar
                        module works — their team schedules visits to client organizations.
                    </p>

                    {/* Current status */}
                    {currentAdminOrg ? (
                        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                            <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-emerald-800">
                                    {currentAdminOrg.name} is the platform company
                                </p>
                                <p className="text-xs text-emerald-600 mt-0.5">
                                    Calendar scheduling is active.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
                            <Building2 className="h-5 w-5 text-amber-500 shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-amber-800">No platform company set</p>
                                <p className="text-xs text-amber-600 mt-0.5">
                                    Select an organization below to enable Calendar scheduling.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Org picker */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Select Organization
                        </p>
                        <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search organizations…"
                                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            />
                        </div>

                        {orgsLoading ? (
                            <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading organizations…
                            </div>
                        ) : (
                            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                                {filtered.length === 0 ? (
                                    <p className="px-4 py-3 text-sm text-slate-400">No organizations found.</p>
                                ) : filtered.map(org => {
                                    const isSelected = pendingOrgId === org.id;
                                    const isCurrent  = adminOrgId   === org.id;
                                    return (
                                        <button
                                            key={org.id}
                                            onClick={() => setPendingOrgId(org.id)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                                                isSelected
                                                    ? "bg-indigo-50"
                                                    : "hover:bg-slate-50"
                                            }`}
                                        >
                                            <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                                isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                                            }`}>
                                                {org.name[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-medium truncate ${isSelected ? "text-indigo-700" : "text-slate-800"}`}>
                                                    {org.name}
                                                </p>
                                                {isCurrent && (
                                                    <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider mt-0.5">
                                                        Current platform company
                                                    </p>
                                                )}
                                            </div>
                                            {isSelected && (
                                                <Check className="h-4 w-4 text-indigo-600 shrink-0" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {adminError && (
                        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{adminError}</p>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                        <button
                            onClick={handleSetAdminOrg}
                            disabled={settingAdmin || !hasChange || !pendingOrgId}
                            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {settingAdmin
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : adminSaved
                                    ? <Check className="h-4 w-4" />
                                    : <ShieldCheck className="h-4 w-4" />
                            }
                            {settingAdmin
                                ? "Applying…"
                                : adminSaved
                                    ? "Done!"
                                    : pendingOrg && hasChange
                                        ? `Set "${pendingOrg.name}" as Platform Company`
                                        : "Set as Platform Company"
                            }
                        </button>
                        {hasChange && pendingOrgId && (
                            <button
                                onClick={() => setPendingOrgId(adminOrgId)}
                                className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Brand Color ──────────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${activeColor}20` }}>
                        <Palette className="h-3.5 w-3.5" style={{ color: activeColor }} />
                    </div>
                    <p className="text-sm font-bold text-slate-800">Brand Color</p>
                </div>
                <div className="p-6 space-y-6">

                    {/* Preset swatches */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Presets</p>
                        <div className="flex flex-wrap gap-3">
                            {PRESET_COLORS.map((p) => {
                                const isActive = selected === p.value && !custom;
                                return (
                                    <button
                                        key={p.value}
                                        onClick={() => { setSelected(p.value); setCustom(""); }}
                                        title={p.label}
                                        className={`relative h-9 w-9 rounded-xl border-2 transition-all ${isActive ? "border-slate-900 scale-110" : "border-transparent hover:scale-105"}`}
                                        style={{ backgroundColor: p.value }}
                                    >
                                        {isActive && <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Custom hex */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Custom Color</p>
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl border border-slate-200 shrink-0" style={{ backgroundColor: custom || selected }} />
                            <input
                                type="text"
                                value={custom}
                                onChange={(e) => setCustom(e.target.value)}
                                placeholder="#4F46E5"
                                maxLength={7}
                                className="w-36 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            />
                            <input
                                type="color"
                                value={custom || selected}
                                onChange={(e) => setCustom(e.target.value)}
                                className="h-9 w-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                            />
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Preview</p>
                        <div className="flex items-center gap-3">
                            <button
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm"
                                style={{ backgroundColor: activeColor }}
                            >
                                Primary Button
                            </button>
                            <span
                                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                style={{ backgroundColor: `${activeColor}15`, color: activeColor }}
                            >
                                Badge
                            </span>
                            <div
                                className="h-1.5 w-24 rounded-full"
                                style={{ backgroundColor: activeColor }}
                            />
                        </div>
                    </div>

                    {colorError && (
                        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{colorError}</p>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                        <button
                            onClick={handleSaveColor}
                            disabled={saving || activeColor === currentColor}
                            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: activeColor }}
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
                        </button>
                        {activeColor !== currentColor && (
                            <button
                                onClick={() => { setSelected(currentColor); setCustom(""); }}
                                className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
