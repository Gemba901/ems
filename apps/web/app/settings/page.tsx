"use client";

import { useState, useRef } from "react";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";
import { AdminService } from "@/services/admin.service";
import { uploadImage } from "@/services/uploads.service";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import Link from "next/link";
import { Palette, Check, Loader2, Bell, ChevronRight, ShieldCheck, ImageIcon, Megaphone } from "lucide-react";

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

function ThemeSection() {
    const { accessToken } = useAuthStore();
    const queryClient = useQueryClient();
    const [selected, setSelected] = useState("#4F46E5");
    const [custom, setCustom] = useState("");
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { data: orgData } = useQuery({
        queryKey: ["settings"],
        queryFn: () => AuthService.getMyOrg(accessToken!),
        enabled: !!accessToken,
        onSuccess: (org: any) => {
            const color = org.primaryColor ?? "#4F46E5";
            setSelected(color);
            if (!PRESET_COLORS.find((p) => p.value === color)) setCustom(color);
        },
    } as any);

    const currentColor = (orgData as any)?.primaryColor ?? "#4F46E5";
    const activeColor = custom || selected;

    const saveMutation = useMutation({
        mutationFn: (color: string) => AdminService.updateCompanyTheme(accessToken!, color),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["settings"] });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        },
        onError: (e: any) => setError(e.message || "Failed to save theme"),
    });

    const saving = saveMutation.isPending;

    const handleSave = () => {
        setError(null);
        setSaved(false);
        saveMutation.mutate(activeColor);
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${activeColor}20` }}>
                    <Palette className="h-4 w-4" style={{ color: activeColor }} />
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-900">Brand Color</p>
                    <p className="text-xs text-slate-400">Used for buttons, highlights, and accents across the platform.</p>
                </div>
            </div>

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

            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Preview</p>
                <div className="flex items-center gap-3 flex-wrap">
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
                    <div className="h-1.5 w-24 rounded-full" style={{ backgroundColor: activeColor }} />
                </div>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={saving || activeColor === currentColor}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
    );
}

function LogoSection() {
    const { accessToken, user, setAuth } = useAuthStore();
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const { data: orgData } = useQuery({
        queryKey: ["settings"],
        queryFn: () => AuthService.getMyOrg(accessToken!),
        enabled: !!accessToken,
    });

    const logoUrl = orgData?.logoUrl ?? null;
    const orgId = orgData?.id ?? null;

    const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !accessToken || !orgId) return;

        setUploading(true);
        try {
            const { fileUrl } = await uploadImage(file, "logos", accessToken);
            await AdminService.updateOrganization(accessToken, orgId, { logoUrl: fileUrl });
            queryClient.invalidateQueries({ queryKey: ["settings"] });
            if (user) setAuth({ ...user, organizationUrl: fileUrl }, accessToken);
        } catch (err) {
            console.error(err);
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-900">Organization Logo</p>
                    <p className="text-xs text-slate-400">Upload a logo for your organization. It will update immediately and be saved for your org.</p>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[auto_1fr] items-center">
                <div className="h-24 w-24 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
                    {logoUrl ? (
                        <img src={logoUrl} alt="Organization logo" className="h-full w-full object-cover" />
                    ) : (
                        <span className="text-xs text-slate-400">No logo yet</span>
                    )}
                </div>
                <div className="space-y-2">
                    <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleLogoChange}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {uploading ? "Uploading…" : "Upload new logo"}
                    </button>
                    <p className="text-xs text-slate-400">Accepted formats: PNG, JPG, GIF.</p>
                </div>
            </div>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN]}>
            <div className="max-w-7xl mx-auto space-y-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Company Settings</h1>
                    <p className="text-sm text-slate-500 mt-1">Customize your workspace and manage organization preferences.</p>
                </div>
                <LogoSection />
                <ThemeSection />
                <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">People</p>
                    <Link
                        href="/settings/members"
                        className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                                <ShieldCheck className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">Team Members & Roles</p>
                                <p className="text-xs text-slate-400">Assign and manage roles for everyone in your organization</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    </Link>
                </div>

                <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Communication</p>
                    <Link
                        href="/settings/notifications"
                        className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-blue-200 hover:bg-blue-50/30 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
                                <Bell className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">Broadcast Notifications</p>
                                <p className="text-xs text-slate-400">Send a notification to all employees in your organization</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                    </Link>
                    <Link
                        href="/settings/notices"
                        className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                                <Megaphone className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">Notices</p>
                                <p className="text-xs text-slate-400">Manage announcements and reminders shown on the employee dashboard</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    </Link>
                </div>
            </div>
        </ProtectedRoute>
    );
}
