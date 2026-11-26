"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { PageHeader } from "@/components/patterns/PageHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/patterns/ConfirmDialog";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { NoticeService, Notice, NoticeType, CreateNoticePayload } from "@/services/notice.service";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import {
    Plus, Trash2, Pin, PinOff, Megaphone, Bell, Info,
    AlertTriangle, Pencil, Loader2, CheckCircle2, X, Calendar,
} from "lucide-react";

const TYPE_OPTIONS: { value: NoticeType; label: string; icon: React.ElementType; chip: string; iconColor: string }[] = [
    { value: "ANNOUNCEMENT", label: "Announcement", icon: Megaphone,     chip: "bg-primary/10 border-primary/20 text-primary", iconColor: "text-primary" },
    { value: "REMINDER",     label: "Reminder",     icon: Bell,          chip: "bg-warning-subtle  border-warning/20  text-warning",  iconColor: "text-warning"  },
    { value: "INFO",         label: "Info",         icon: Info,          chip: "bg-muted  border-border  text-muted-foreground",  iconColor: "text-muted-foreground"  },
    { value: "ALERT",        label: "Alert",        icon: AlertTriangle, chip: "bg-danger-subtle    border-danger/20    text-danger",    iconColor: "text-danger"    },
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

    const { data: notices = [], isLoading, error: loadError } = useQuery({
        queryKey: ["notices"],
        queryFn: () => NoticeService.getNotices(accessToken),
        enabled: !!accessToken,
    });

    // ── Form state ─────────────────────────────────────────────────────────────
    const [noticeToDelete, setNoticeToDelete] = useState<Notice | null>(null);
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
        if (isSaving) return;
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
        <div className="mx-auto max-w-3xl space-y-6">
            <PageHeader
                title="Notices"
                description="Manage announcements and reminders shown on the employee dashboard."
                breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Notices" }]}
                actions={<Button onClick={openCreate} disabled={isSaving}><Plus /> New Notice</Button>}
            />
            <ConfirmDialog
                open={noticeToDelete !== null}
                onOpenChange={(open) => { if (!open) setNoticeToDelete(null); }}
                title="Delete notice"
                description={`Remove “${noticeToDelete?.title ?? ""}” from the employee dashboard?`}
                confirmLabel="Delete notice"
                destructive
                onConfirm={async () => { if (noticeToDelete) await deleteMutation.mutateAsync(noticeToDelete.id); }}
            />

            {/* Form */}
            {showForm && (
                <div className="bg-card rounded-xl border border-border p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{editing ? "Edit Notice" : "New Notice"}</p>
                        <Button variant="ghost" aria-label="Close notice form" onClick={closeForm} disabled={isSaving} className="text-muted-foreground hover:text-foreground transition-colors">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Type selector */}
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Type</label>
                            <div className="flex flex-wrap gap-2">
                                {TYPE_OPTIONS.map((t) => (
                                    <Button variant="ghost"
                                        key={t.value} aria-pressed={form.type === t.value}
                                        type="button"
                                        onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                            form.type === t.value
                                                ? t.chip + " ring-2 ring-offset-1 ring-current"
                                                : "bg-card border-border text-muted-foreground hover:border-border"
                                        }`}
                                    >
                                        <t.icon className="h-3 w-3" />
                                        {t.label}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Title */}
                        <div>
                            <label htmlFor="notice-title" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Title</label>
                            <Input
                                type="text"
                                id="notice-title"
                                value={form.title}
                                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                placeholder="e.g. Town Hall — Friday 2 PM"
                                className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        {/* Body */}
                        <div>
                            <label htmlFor="notice-body" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Message</label>
                            <Textarea
                                rows={3}
                                id="notice-body"
                                value={form.body}
                                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                                placeholder="Full details of the notice…"
                                className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        {/* Options row */}
                        <div className="flex items-center gap-4 flex-wrap">
                            {/* Pinned */}
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <Checkbox
                                    checked={!!form.pinned}
                                    onCheckedChange={(pinned) => setForm((f) => ({ ...f, pinned }))}
                                />
                                <span className="text-sm text-muted-foreground">Pin to top</span>
                            </label>

                            {/* Expiry */}
                            <div className="flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <label htmlFor="notice-expiresAt" className="text-sm text-muted-foreground shrink-0">Expires on</label>
                                <Input
                                    type="date"
                                    id="notice-expiresAt"
                                    value={form.expiresAt ?? ""}
                                    onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value || null }))}
                                    className="w-auto rounded-lg border border-border px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                                {form.expiresAt && (
                                    <Button variant="ghost" type="button" aria-label="Clear expiry date" onClick={() => setForm((f) => ({ ...f, expiresAt: null }))}
                                        className="text-muted-foreground hover:text-muted-foreground transition-colors">
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {formError && (
                            <p role="alert" className="text-xs text-danger bg-danger-subtle border border-danger/20 px-3 py-2 rounded-lg">{formError}</p>
                        )}

                        <div className="flex items-center gap-3 pt-1 border-t border-border">
                            <Button
                                type="submit"
                                disabled={isSaving}
                                className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-xl hover:bg-primary disabled:opacity-50 transition-colors"
                            >
                                {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><CheckCircle2 className="h-3.5 w-3.5" /> {editing ? "Save Changes" : "Post Notice"}</>}
                            </Button>
                            <Button variant="ghost" type="button" onClick={closeForm} disabled={isSaving} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</Button>
                        </div>
                    </form>
                </div>
            )}

            {pinMutation.isError && <p role="alert" className="text-sm text-danger">{pinMutation.error.message}</p>}

            {/* List */}
            <div className="bg-card rounded-xl border border-border">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading notices…
                    </div>
                ) : loadError ? (
                    <p role="alert" className="p-5 text-sm text-danger">{loadError.message}</p>
                ) : notices.length === 0 ? (
                    <div className="py-12 text-center">
                        <Megaphone className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">No notices yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Create one to start communicating with your team.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {notices.map((n: Notice) => {
                            const tc = typeConfig(n.type);
                            return (
                                <div key={n.id} className="flex flex-wrap items-start gap-3 px-5 py-4 sm:flex-nowrap">
                                    {/* Icon */}
                                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${tc.chip}`}>
                                        <tc.icon className={`h-3.5 w-3.5 ${tc.iconColor}`} />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-semibold text-foreground">{n.title}</p>
                                            {n.pinned && <Pin className="h-3 w-3 text-muted-foreground shrink-0" />}
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tc.chip}`}>
                                                {tc.label}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                                        <div className="flex items-center gap-3 mt-1.5">
                                            <span className="text-[11px] text-muted-foreground">Posted {fmtDate(n.createdAt)}</span>
                                            {n.expiresAt && (
                                                <span className="text-[11px] text-warning">Expires {fmtDate(n.expiresAt)}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button variant="ghost"
                                            onClick={() => pinMutation.mutate({ id: n.id, pinned: !n.pinned })}
                                            disabled={pinMutation.isPending}
                                            aria-label={n.pinned ? "Unpin notice" : "Pin notice"}
                                            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                        >
                                            {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                                        </Button>
                                        <Button variant="ghost"
                                            onClick={() => openEdit(n)} disabled={isSaving}
                                            aria-label="Edit notice"
                                            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost"
                                            onClick={() => setNoticeToDelete(n)}
                                            disabled={deleteMutation.isPending || isSaving}
                                            aria-label="Delete notice"
                                            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-danger hover:bg-danger-subtle transition-colors disabled:opacity-40"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
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
