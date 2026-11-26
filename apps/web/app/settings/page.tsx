"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { PageHeader } from "@/components/patterns/PageHeader";

import { TenantImage } from "@/components/files/TenantImage";
import { useState, useRef } from "react";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";
import { uploadImage } from "@/services/uploads.service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import Link from "next/link";
import { Loader2, Bell, ChevronRight, ShieldCheck, ImageIcon, Megaphone, Ticket } from "lucide-react";

function LogoSection() {
    const { accessToken, user, setAuth } = useAuthStore();
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
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
        setUploadError(null);
        try {
            const { fileUrl } = await uploadImage(file, "logos", accessToken);
            await AuthService.updateMyOrg(accessToken, { logoUrl: fileUrl });
            queryClient.invalidateQueries({ queryKey: ["settings"] });
            if (user) setAuth({ ...user, organizationUrl: fileUrl }, accessToken);
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : "Failed to upload the organization logo.");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    return (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-foreground">Organization Logo</p>
                    <p className="text-xs text-muted-foreground">Upload a logo for your organization. It will update immediately and be saved for your org.</p>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[auto_1fr] items-center">
                <div className="h-24 w-24 rounded-2xl overflow-hidden border border-border bg-muted flex items-center justify-center">
                    {logoUrl ? (
                        <TenantImage src={logoUrl} alt="Organization logo" className="h-full w-full object-cover" />
                    ) : (
                        <span className="text-xs text-muted-foreground">No logo yet</span>
                    )}
                </div>
                <div className="space-y-2">
                    <Input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleLogoChange}
                    />
                    <Button variant="ghost"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || !orgId}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {uploading ? "Uploading…" : "Upload new logo"}
                    </Button>
                    {uploadError && <p role="alert" className="text-sm text-danger">{uploadError}</p>}
                    <p className="text-xs text-muted-foreground">Accepted formats: PNG, JPG, GIF.</p>
                </div>
            </div>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN]}>
            <div className="max-w-7xl mx-auto space-y-8">
                <PageHeader
                    title="Company Settings"
                    description="Customize your workspace and manage organization preferences."
                />
                <LogoSection />
                <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">People</p>
                    <Link
                        href="/settings/members"
                        className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border shadow-sm hover:border-primary/20 hover:bg-primary/5 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Team Members & Roles</p>
                                <p className="text-xs text-muted-foreground">Assign and manage roles for everyone in your organization</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Link>
                </div>

                <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Communication</p>
                    <Link
                        href="/settings/notifications"
                        className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border shadow-sm hover:border-info/20 hover:bg-info-subtle/50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-info-subtle flex items-center justify-center">
                                <Bell className="h-4 w-4 text-info" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Broadcast Notifications</p>
                                <p className="text-xs text-muted-foreground">Send a notification to all employees in your organization</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-info transition-colors" />
                    </Link>
                    <Link
                        href="/settings/notices"
                        className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border shadow-sm hover:border-primary/20 hover:bg-primary/5 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Megaphone className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Notices</p>
                                <p className="text-xs text-muted-foreground">Manage announcements and reminders shown on the employee dashboard</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Link>
                </div>

                <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Support</p>
                    <Link
                        href="/settings/tickets"
                        className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border shadow-sm hover:border-warning/20 hover:bg-warning-subtle/50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-warning-subtle flex items-center justify-center">
                                <Ticket className="h-4 w-4 text-warning" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Tickets</p>
                                <p className="text-xs text-muted-foreground">Review and resolve tickets raised by your team</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-warning transition-colors" />
                    </Link>
                </div>
            </div>
        </ProtectedRoute>
    );
}
