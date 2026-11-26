"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { PageHeader } from "@/components/patterns/PageHeader";

import { useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";
import { AdminService } from "@/services/admin.service";
import {
    Palette, Check, Loader2, Building2, ShieldCheck, Search,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    const queryClient = useQueryClient();

    // Brand color UI state
    const [selectedPreset, setSelected]   = useState<string | null>(null);
    const [custom, setCustom]             = useState("");
    const [saved, setSaved]               = useState(false);
    const [colorError, setColorError]     = useState<string | null>(null);

    // Platform identity UI state
    const [chosenOrgId, setPendingOrgId]     = useState<string | null>(null);
    const [search, setSearch]                 = useState("");
    const [adminSaved, setAdminSaved]         = useState(false);
    const [adminError, setAdminError]         = useState<string | null>(null);

    const { data: settingsData } = useQuery({
        queryKey: ["settings"],
        queryFn: () => AuthService.getMyOrg(accessToken!),
        enabled: !!accessToken,
    });

    const currentColor = settingsData?.primaryColor ?? "#4F46E5";
    const selected = selectedPreset ?? currentColor;

    const { data: orgsData, isLoading: orgsLoading } = useQuery({
        queryKey: ["admin-settings-orgs"],
        queryFn: () => AdminService.listOrganizations(accessToken!, 1, 200),
        enabled: !!accessToken,
    });

    const orgs = orgsData?.data ?? [];
    const adminOrgId = orgs.find(o => o.isAdminOrg)?.id ?? null;
    const pendingOrgId = chosenOrgId ?? adminOrgId;

    const activeColor = custom || selected;
    const validColor = /^#[0-9a-f]{6}$/i.test(activeColor);

    const adminOrgMutation = useMutation({
        mutationFn: (orgId: string) => AdminService.setAdminOrg(accessToken!, orgId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-settings-orgs"] });
            setAdminSaved(true);
            setTimeout(() => setAdminSaved(false), 3000);
        },
        onError: (error) => {
            setAdminError(error.message || "Failed to set platform company");
        },
    });

    const colorMutation = useMutation({
        mutationFn: (color: string) => AdminService.updateCompanyTheme(accessToken!, color),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["settings"] });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        },
        onError: (error) => {
            setColorError(error.message || "Failed to save theme");
        },
    });

    const handleSetAdminOrg = () => {
        if (!pendingOrgId || pendingOrgId === adminOrgId) return;
        setAdminError(null);
        adminOrgMutation.mutate(pendingOrgId);
    };

    const handleSaveColor = () => {
        setColorError(null);
        setSaved(false);
        colorMutation.mutate(activeColor);
    };

    const saving = colorMutation.isPending;
    const settingAdmin = adminOrgMutation.isPending;

    const filtered = orgs.filter(o =>
        o.name.toLowerCase().includes(search.toLowerCase())
    );

    const currentAdminOrg = orgs.find(o => o.id === adminOrgId);
    const pendingOrg      = orgs.find(o => o.id === pendingOrgId);
    const hasChange       = pendingOrgId !== adminOrgId;

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <PageHeader
                title="Platform Settings"
                description="Manage the platform company designation and appearance."
            />

            {/* ── Platform Identity ──────────────────────────────────────────── */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-sm font-bold text-foreground">Platform Company</p>
                </div>
                <div className="p-6 space-y-5">
                    <p className="text-sm text-muted-foreground">
                        The <span className="font-semibold text-foreground">platform company</span> is the consultancy
                        that owns and operates this system. Designating an organization here controls how the Calendar
                        module works — their team schedules visits to client organizations.
                    </p>

                    {/* Current status */}
                    {currentAdminOrg ? (
                        <div className="flex items-center gap-3 px-4 py-3 bg-success-subtle border border-success/20 rounded-xl">
                            <ShieldCheck className="h-5 w-5 text-success shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-success">
                                    {currentAdminOrg.name} is the platform company
                                </p>
                                <p className="text-xs text-success mt-0.5">
                                    Calendar scheduling is active.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 px-4 py-3 bg-warning-subtle border border-warning/20 rounded-xl">
                            <Building2 className="h-5 w-5 text-warning shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-warning">No platform company set</p>
                                <p className="text-xs text-warning mt-0.5">
                                    Select an organization below to enable Calendar scheduling.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Org picker */}
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Select Organization
                        </p>
                        <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                aria-label="Search organizations"
                                placeholder="Search organizations…"
                                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                            />
                        </div>

                        {orgsLoading ? (
                            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading organizations…
                            </div>
                        ) : (
                            <div className="border border-border rounded-xl divide-y divide-border max-h-56 overflow-y-auto">
                                {filtered.length === 0 ? (
                                    <p className="px-4 py-3 text-sm text-muted-foreground">No organizations found.</p>
                                ) : filtered.map(org => {
                                    const isSelected = pendingOrgId === org.id;
                                    const isCurrent  = adminOrgId   === org.id;
                                    return (
                                        <Button variant="ghost"
                                            key={org.id}
                                            aria-pressed={isSelected}
                                            onClick={() => setPendingOrgId(org.id)}
                                            className={`h-auto w-full justify-start gap-3 px-4 py-3 text-left transition-colors ${
                                                isSelected
                                                    ? "bg-primary/10"
                                                    : "hover:bg-muted"
                                            }`}
                                        >
                                            <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                                isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                            }`}>
                                                {org.name[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                                                    {org.name}
                                                </p>
                                                {isCurrent && (
                                                    <p className="text-[10px] text-success font-semibold uppercase tracking-wider mt-0.5">
                                                        Current platform company
                                                    </p>
                                                )}
                                            </div>
                                            {isSelected && (
                                                <Check className="h-4 w-4 text-primary shrink-0" />
                                            )}
                                        </Button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {adminError && (
                        <p className="text-xs text-danger bg-danger-subtle rounded-lg px-3 py-2">{adminError}</p>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                        <Button
                            onClick={handleSetAdminOrg}
                            disabled={settingAdmin || !hasChange || !pendingOrgId}
                            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                        </Button>
                        {hasChange && pendingOrgId && (
                            <Button variant="ghost"
                                onClick={() => setPendingOrgId(adminOrgId)}
                                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Reset
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Brand Color ──────────────────────────────────────────────────── */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${activeColor}20` }}>
                        <Palette className="h-3.5 w-3.5" style={{ color: activeColor }} />
                    </div>
                    <p className="text-sm font-bold text-foreground">Brand Color</p>
                </div>
                <div className="p-6 space-y-6">

                    {/* Preset swatches */}
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Presets</p>
                        <div className="flex flex-wrap gap-3">
                            {PRESET_COLORS.map((p) => {
                                const isActive = selected === p.value && !custom;
                                return (
                                    <Button variant="ghost"
                                        key={p.value}
                                        onClick={() => { setSelected(p.value); setCustom(""); }}
                                        aria-label={p.label} aria-pressed={isActive} title={p.label}
                                        className={`relative h-9 w-9 rounded-xl border-2 transition-all ${isActive ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                                        style={{ backgroundColor: p.value }}
                                    >
                                        {isActive && <Check className="absolute inset-0 m-auto h-4 w-4 text-primary-foreground" />}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Custom hex */}
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Custom Color</p>
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl border border-border shrink-0" style={{ backgroundColor: validColor ? activeColor : selected }} />
                            <Input
                                type="text"
                                aria-label="Custom hex color" aria-invalid={!!custom && !validColor}
                                value={custom}
                                onChange={(e) => setCustom(e.target.value)}
                                placeholder="#4F46E5"
                                maxLength={7}
                                className="w-36 border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                            />
                            <Input
                                type="color" aria-label="Choose custom color"
                                value={validColor ? activeColor : selected}
                                onChange={(e) => setCustom(e.target.value)}
                                className="h-9 w-9 rounded-lg border border-border cursor-pointer p-0.5"
                            />
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="rounded-xl border border-border p-4 bg-muted">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Preview</p>
                        <div className="flex items-center gap-3">
                            <Button variant="ghost"
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-background dark:text-foreground shadow-sm"
                                style={{ backgroundColor: validColor ? activeColor : selected }}
                            >
                                Primary Button
                            </Button>
                            <span
                                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                style={{ backgroundColor: `${activeColor}15`, color: activeColor }}
                            >
                                Badge
                            </span>
                            <div
                                className="h-1.5 w-24 rounded-full"
                                style={{ backgroundColor: validColor ? activeColor : selected }}
                            />
                        </div>
                    </div>

                    {colorError && (
                        <p className="text-xs text-danger bg-danger-subtle rounded-lg px-3 py-2">{colorError}</p>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                        <Button variant="ghost"
                            onClick={handleSaveColor}
                            disabled={saving || !validColor || activeColor === currentColor}
                            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-primary-foreground rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: validColor ? activeColor : selected }}
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
                        </Button>
                        {activeColor !== currentColor && (
                            <Button variant="ghost"
                                onClick={() => { setSelected(currentColor); setCustom(""); }}
                                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Reset
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
