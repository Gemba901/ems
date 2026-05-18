"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
    LayoutDashboard,
    Building2,
    LogOut,
    ChevronRight,
    Menu,
    Shield,
    X,
    Settings,
} from "lucide-react";

const NAV = [
    { label: "Dashboard",     href: "/admin",               icon: LayoutDashboard },
    { label: "Organizations", href: "/admin/organizations",  icon: Building2 },
    { label: "Settings",      href: "/admin/settings",       icon: Settings },
];

interface AdminSidebarProps {
    open: boolean;
    onClose: () => void;
}

function AdminSidebar({ open, onClose }: AdminSidebarProps) {
    const pathname  = usePathname();
    const router    = useRouter();
    const { user, logout } = useAuthStore();

    const initials = user?.name
        ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
        : "SA";

    const handleLogout = () => {
        logout();
        router.replace("/login");
    };

    return (
        <>
            {/* Mobile backdrop */}
            {open && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={onClose}
                />
            )}

            <aside className={`
                fixed left-0 top-0 h-screen w-55 bg-[#0d0d14] flex flex-col border-r border-white/6 z-50
                transition-transform duration-300
                ${open ? "translate-x-0" : "-translate-x-full"}
                md:translate-x-0
            `}>
                {/* Brand */}
                <div className="px-5 py-5 border-b border-white/6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                            <Shield className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <p className="text-white text-[13px] font-semibold leading-none">Admin Console</p>
                            <p className="text-[10px] text-white/30 uppercase tracking-widest mt-0.5">Gemba PMS</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="md:hidden p-1 text-white/30 hover:text-white/60 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
                    <p className="text-[10px] text-white/20 uppercase tracking-widest px-3 pb-2 font-medium">Platform</p>
                    {NAV.map(({ label, href, icon: Icon }) => {
                        const isActive =
                            href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
                        return (
                            <Link
                                key={href}
                                href={href}
                                onClick={onClose}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                                    isActive
                                        ? "bg-white/8 text-white"
                                        : "text-white/40 hover:text-white/80 hover:bg-white/4"
                                }`}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                {label}
                                {isActive && (
                                    <ChevronRight className="h-3.5 w-3.5 ml-auto text-white/30" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* User */}
                <div className="px-3 py-4 border-t border-white/6 space-y-1">
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
                        <div className="h-7 w-7 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-[11px] font-bold shrink-0">
                            {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-[12px] font-medium truncate">{user?.name}</p>
                            <p className="text-[10px] text-indigo-400/70 uppercase tracking-wider">Super Admin</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-white/30 hover:text-red-400 hover:bg-red-500/8 transition-all"
                    >
                        <LogOut className="h-4 w-4" />
                        Sign out
                    </button>
                </div>
            </aside>
        </>
    );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

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
        setReady(true);
    }, [_hasHydrated, isAuthenticated, user, router]);

    if (!ready) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#0d0d14]">
                <div className="flex items-center gap-3 text-white/40 text-sm">
                    <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    Verifying access...
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f4f6f9]">
            <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <div className="md:ml-55 min-h-screen flex flex-col">
                {/* Mobile top bar */}
                <div className="md:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-slate-200 sticky top-0 z-30">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 -ml-1 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                        aria-label="Open menu"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded bg-indigo-600 flex items-center justify-center">
                            <Shield className="h-3.5 w-3.5 text-white" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900">Admin Console</span>
                    </div>
                </div>

                <main className="flex-1 px-4 py-5 md:px-8 md:py-7">
                    {children}
                </main>
            </div>
        </div>
    );
}
