"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Box,
  LayoutGrid,
  Users,
  Archive,
  Settings,
  HelpCircle,
  BarChart2,
  LogOut,
  UserCog,
  Stethoscope,
} from "lucide-react";
import { useAuthStore } from "../store/auth.store";
import { useEffect } from "react";
import { Role } from "@/types/role";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    console.log(user)
  }, [user])
  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const mainNav = [
    { 
      name: "Dashboard", 
      href: "/", 
      icon: LayoutGrid,
      allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE] 
    },
    { 
      name: "Inventory", 
      href: "/inventory", 
      icon: Archive,
      allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD] 
    },
    { 
      name: "Operations", 
      href: "/operations", 
      icon: Settings,
      allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT] 
    },
    {
      name: "Reports",
      href: "/reports",
      icon: BarChart2,
      allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]
    },
    {
      name: "HR",
      href: "/hr",
      icon: Stethoscope,
      allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR]
    },
    {
      name: "Settings",
      href: "/settings",
      icon: UserCog,
      allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN]
    },
    // {
    //   name: "Suggestions",
    //   href: "/sims",
    //   icon: MessageSquareText,
    //   allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE],
    // },
  ];

  
  const userRole = user?.roleLevel;
  
  const filteredNav = mainNav.filter(
    (item) => userRole && item.allowedRoles.includes(userRole)
  );

  const labelClass = `ml-2 text-sm font-medium transition-opacity duration-300 whitespace-nowrap ${
    open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
  }`;

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed z-50 flex flex-col bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-slate-100 transition-all duration-300 ease-in-out overflow-hidden group
        top-0 left-0 h-dvh w-64 border-r rounded-none
        ${open ? "translate-x-0" : "-translate-x-full"}
        md:left-4 md:top-4 md:h-[calc(100dvh-2rem)] md:rounded-2xl md:border md:translate-x-0 md:w-16 md:hover:w-64
      `}>

        {/* Top Logo */}
        <div className="flex items-center h-20 px-3 shrink-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-blue-600 rounded-xl shadow-sm ml-0.5 transition-transform group-hover:scale-105">
            <Box className="h-5 w-5 text-white" />
          </div>
          <div className={`ml-4 flex flex-col whitespace-nowrap ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity duration-300`}>
            <span className="text-sm font-bold tracking-wide text-slate-900">{user?.organizationName || "Workspace"}</span>
            <span className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Workspace</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-2 px-3 mt-4 overflow-y-auto min-h-0">
          {filteredNav.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={`flex items-center h-10 rounded-xl transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                }`}
              >
                <div className="flex shrink-0 w-10 items-center justify-center">
                  <item.icon className={`h-5 w-5 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                </div>
                <span className={labelClass}>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Support - Visible to everyone */}
        <div className="mb-4 px-3">
          <Link
            href="/support"
            onClick={onClose}
            className="flex items-center h-10 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
          >
            <div className="flex shrink-0 w-10 items-center justify-center">
              <HelpCircle className="h-5 w-5" />
            </div>
            <span className={labelClass}>Support</span>
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center h-10 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors w-full"
          >
            <div className="flex shrink-0 w-10 items-center justify-center">
              <LogOut className="h-5 w-5" />
            </div>
            <span className={labelClass}>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}