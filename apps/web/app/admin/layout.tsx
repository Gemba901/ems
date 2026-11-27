"use client";

import { SkipToMainContent } from "@/components/Header";
import { Button } from "@/components/ui/button";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";
import { Role } from "@/types/role";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { ModuleSidebar, SIDEBAR_PADDING, type SidebarNavItem } from "@/components/shell/ModuleSidebar";
import {
    LayoutDashboard,
    Building2,
    LogOut,
    Menu,
    Shield,
    Settings,
} from "lucide-react";

const NAV: SidebarNavItem[] = [
    { label: "Readiness",     href: "/admin/readiness",     icon: Shield },
    { label: "Dashboard",     href: "/admin",               icon: LayoutDashboard, exact: true },
    { label: "Organizations", shortLabel: "Orgs", href: "/admin/organizations", icon: Building2 },
    { label: "Settings",      href: "/admin/settings",      icon: Settings },
];

interface AdminSidebarProps {
    open: boolean;
    onClose: () => void;
    collapsed: boolean;
    onToggle: () => void;
}

function AdminSidebar(props: AdminSidebarProps) {
    const router    = useRouter();
    const { user, logout } = useAuthStore();
    const queryClient = useQueryClient();

    const initials = user?.name
        ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
        : "SA";

    const handleLogout = async () => {
        await AuthService.logout();
        logout();
        queryClient.clear();
        router.replace("/login");
    };

    const footer = (collapsed: boolean) =>
        collapsed ? (
            <>
                <span
                    className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground"
                    title={user?.name ?? "Super Admin"}
                >
                    {initials}
                </span>
                <Button
                    type="button"
                    onClick={handleLogout}
                    title="Sign out"
                    className="flex w-[72px] flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
                >
                    <LogOut className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
                    <span className="text-[10.5px] font-medium leading-tight">Sign out</span>
                </Button>
            </>
        ) : (
            <div className="space-y-1 border-t border-border px-3 py-3">
                <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground">
                        {initials}
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-foreground">{user?.name}</span>
                        <span className="block text-[10px] uppercase tracking-wider text-primary">Super Admin</span>
                    </span>
                </div>
                <Button variant="ghost"
                    type="button"
                    onClick={handleLogout}
                    className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
                >
                    <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                    Sign out
                </Button>
            </div>
        );

    return (
        <ModuleSidebar
            {...props}
            id="admin-sidebar"
            title="Admin Console"
            subtitle="Gemba PMS"
            homeHref="/admin"
            brand={
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                    <Shield className="h-4 w-4 text-primary-foreground" />
                </span>
            }
            ariaLabel="Admin navigation"
            groups={[{ name: "Platform", items: NAV }]}
            backLink={{ label: "Main App", href: "/" }}
            footer={footer}
        />
    );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();
    const ready = _hasHydrated && isAuthenticated && user?.roleLevel === Role.SUPER_ADMIN;
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { collapsed, toggle } = useSidebarCollapsed();

    useEffect(() => {
        if (!_hasHydrated) return;
        if (!isAuthenticated || !user) {
            router.replace("/login");
            return;
        }
        if (user.roleLevel !== Role.SUPER_ADMIN) {
            router.replace("/");
            return;
        }
    }, [_hasHydrated, isAuthenticated, user, router]);

    if (!ready) {
        return (
            <div className="h-screen flex items-center justify-center bg-background">
                <div className="flex items-center gap-3 text-muted-foreground text-sm">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Verifying access...
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <SkipToMainContent />
            <AdminSidebar
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                collapsed={collapsed}
                onToggle={toggle}
            />

            <div className={`flex flex-col min-h-screen transition-[padding] duration-300 motion-reduce:transition-none ${collapsed ? SIDEBAR_PADDING.collapsed : SIDEBAR_PADDING.expanded}`}>
                {/* Mobile top bar */}
                <div className="lg:hidden flex items-center gap-3 px-4 h-14 bg-card border-b border-border sticky top-0 z-30">
                    <Button variant="ghost"
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 -ml-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                        aria-label="Open navigation"
                        aria-haspopup="dialog"
                        aria-expanded={sidebarOpen}
                        aria-controls="admin-sidebar"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
                            <Shield className="h-3.5 w-3.5 text-primary-foreground" />
                        </div>
                        <span className="text-sm font-semibold text-foreground">Admin Console</span>
                    </div>
                </div>

                <main id="main-content" tabIndex={-1} className="scroll-mt-16 flex-1 px-4 py-5 md:px-8 md:py-7">
                    {children}
                </main>
            </div>
        </div>
    );
}
