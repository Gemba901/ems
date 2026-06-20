"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { NoticeService, Notice, NoticeType, CreateNoticePayload } from "@/services/notice.service";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import {
    ArrowLeft, Plus, Trash2, Pin, PinOff, Megaphone, Bell, Info,
    AlertTriangle, Pencil, Loader2, CheckCircle2, X, Calendar,
} from "lucide-react";
import Link from "next/link";

const TYPE_OPTIONS: { value: NoticeType; label: string; icon: React.ElementType; chip: string; iconColor: string }[] = [
    { value: "ANNOUNCEMENT", label: "Announcement", icon: Megaphone,     chip: "bg-indigo-50 border-indigo-200 text-indigo-700", iconColor: "text-indigo-500" },
    { value: "REMINDER",     label: "Reminder",     icon: Bell,          chip: "bg-amber-50  border-amber-200  text-amber-700",  iconColor: "text-amber-500"  },
    { value: "INFO",         label: "Info",         icon: Info,          chip: "bg-slate-50  border-slate-200  text-slate-600",  iconColor: "text-slate-400"  },
    { value: "ALERT",        label: "Alert",        icon: AlertTriangle, chip: "bg-red-50    border-red-200    text-red-700",    iconColor: "text-red-500"    },
];

function typeConfig(type: NoticeType) {
    return TYPE_OPTIONS.find((t) => t.value === type) ?? TYPE_OPTIONS[2];
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const BLANK: CreateNoticePayload = { type: "INFO", title: "", body: "", pinned: false, expiresAt: null };

export default function NoticesSettingsPage() {
    return (
        <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
            <NoticesContent />
        </ProtectedRoute>
    );
}

function NoticesContent() {
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const queryClient = useQueryClient();

    const { data: notices = [], isLoading } = useQuery({
        queryKey: ["notices"],
        queryFn: () => NoticeService.getNotices(accessToken),
        enabled: !!accessToken,
    });

    // ── Form state ─────────────────────────────────────────────────────────────
    const [showForm, setShowForm]     = useState(false);
    const [editing, setEditing]       = useState<Notice | null>(null);
    const [form, setForm]             = useState<CreateNoticePayload>(BLANK);
    const [formError, setFormError]   = useState("");

    function openCreate() {
        setEditing(null);
        setForm(BLANK);
        setFormError("");
        setShowForm(true);
    }

    function openEdit(n: Notice) {
        setEditing(n);
        setForm({
            type:      n.type,
            title:     n.title,
            body:      n.body,
            pinned:    n.pinned,
            expiresAt: n.expiresAt ? n.expiresAt.slice(0, 10) : null,
        });
        setFormError("");
        setShowForm(true);
    }

    function closeForm() { setShowForm(false); setEditing(null); setForm(BLANK); }

    // ── Mutations ──────────────────────────────────────────────────────────────
    const createMutation = useMutation({
        mutationFn: (payload: CreateNoticePayload) => NoticeService.createNotice(accessToken, payload),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["notices"] }); closeForm(); },
        onError: (e: Error) => setFormError(e.message),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateNoticePayload> }) =>
            NoticeService.updateNotice(accessToken, id, payload),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["notices"] }); closeForm(); },
        onError: (e: Error) => setFormError(e.message),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => NoticeService.deleteNotice(accessToken, id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notices"] }),
    });

    const pinMutation = useMutation({
        mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
            NoticeService.updateNotice(accessToken, id, { pinned }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notices"] }),
    });

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setFormError("");
        if (!form.title.trim()) { setFormError("Title is required."); return; }
        if (!form.body.trim())  { setFormError("Body text is required."); return; }
        const payload = {
            ...form,
            expiresAt: form.expiresAt || null,
        };
        if (editing) {
            updateMutation.mutate({ id: editing.id, payload });
        } else {
            createMutation.mutate(payload);
        }
    }

    const isSaving = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="p-6 space-y-6 max-w-3xl">
            {/* Header */}
            <div>
                <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Settings
                </Link>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-bold text-slate-900">Notices</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Manage announcements and reminders shown to all employees on the dashboard.</p>
                    </div>
                    <button
                        onClick={openCreate}
                        className="shrink-0 inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                        <Plus className="h-4 w-4" /> New Notice
                    </button>
                </div>
            </div>

            {/* Form */}
            {showForm && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-800">{editing ? "Edit Notice" : "New Notice"}</p>
                        <button onClick={closeForm} className="text-slate-400 hover:text-slate-700 transition-colors">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Type selector */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Type</label>
                            <div className="flex flex-wrap gap-2">
                                {TYPE_OPTIONS.map((t) => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                            form.type === t.value
                                                ? t.chip + " ring-2 ring-offset-1 ring-current"
                                                : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                                        }`}
                                    >
                                        <t.icon className="h-3 w-3" />
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Title */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Title</label>
                            <input
                                type="text"
                                value={form.title}
                                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                placeholder="e.g. Town Hall — Friday 2 PM"
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Body */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Message</label>
                            <textarea
                                rows={3}
                                value={form.body}
                                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                                placeholder="Full details of the notice…"
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Options row */}
                        <div className="flex items-center gap-4 flex-wrap">
                            {/* Pinned */}
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={!!form.pinned}
                                    onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-slate-600">Pin to top</span>
                            </label>

                            {/* Expiry */}
                            <div className="flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <label className="text-sm text-slate-600 shrink-0">Expires on</label>
                                <input
                                    type="date"
                                    value={form.expiresAt ?? ""}
                                    onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value || null }))}
                                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                {form.expiresAt && (
                                    <button type="button" onClick={() => setForm((f) => ({ ...f, expiresAt: null }))}
                                        className="text-slate-400 hover:text-slate-600 transition-colors">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {formError && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{formError}</p>
                        )}

                        <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><CheckCircle2 className="h-3.5 w-3.5" /> {editing ? "Save Changes" : "Post Notice"}</>}
                            </button>
                            <button type="button" onClick={closeForm} className="text-sm text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            {/* List */}
            <div className="bg-white rounded-xl border border-slate-200">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading notices…
                    </div>
                ) : notices.length === 0 ? (
                    <div className="py-12 text-center">
                        <Megaphone className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm font-medium text-slate-400">No notices yet</p>
                        <p className="text-xs text-slate-400 mt-1">Create one to start communicating with your team.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {notices.map((n: Notice) => {
                            const tc = typeConfig(n.type);
                            return (
                                <div key={n.id} className="px-5 py-4 flex items-start gap-4">
                                    {/* Icon */}
                                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${tc.chip}`}>
                                        <tc.icon className={`h-3.5 w-3.5 ${tc.iconColor}`} />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                                            {n.pinned && <Pin className="h-3 w-3 text-slate-400 shrink-0" />}
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tc.chip}`}>
                                                {tc.label}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.body}</p>
                                        <div className="flex items-center gap-3 mt-1.5">
                                            <span className="text-[11px] text-slate-400">Posted {fmtDate(n.createdAt)}</span>
                                            {n.expiresAt && (
                                                <span className="text-[11px] text-amber-500">Expires {fmtDate(n.expiresAt)}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => pinMutation.mutate({ id: n.id, pinned: !n.pinned })}
                                            title={n.pinned ? "Unpin" : "Pin"}
                                            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                        >
                                            {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                                        </button>
                                        <button
                                            onClick={() => openEdit(n)}
                                            title="Edit"
                                            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => deleteMutation.mutate(n.id)}
                                            disabled={deleteMutation.isPending}
                                            title="Delete"
                                            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
