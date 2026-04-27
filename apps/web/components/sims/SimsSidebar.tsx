"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Lightbulb,
  Plus,
  LayoutGrid,
  MessageSquareText,
  BarChart2,
  Archive,
  Settings,
  ArrowLeft,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";

export function SimsSidebar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  
  const simsNav = [
    { 
      name: "Overview", 
      href: "/sims", 
      icon: LayoutGrid,
      allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE] 
    },
    { 
      name: "My Suggestions", 
      href: "/sims/my-suggestions", 
      icon: Lightbulb,
      allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]
    },
    { 
      name: "Reviews", 
      href: "/sims/reviews", 
      icon: MessageSquareText,
      
      allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD] 
    },
    { 
      name: "Analytics", 
      href: "/sims/analytics", 
      icon: BarChart2,
      
      allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD] 
    },
  ];

  const userRole = user?.roleLevel;
  
  const filteredNav = simsNav.filter(
    (item) => userRole && item.allowedRoles.includes(userRole)
  );

  return (
    <aside className="fixed left-4 top-4 bottom-4 z-50 flex flex-col bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 transition-all duration-300 ease-in-out w-16 hover:w-64 group overflow-hidden">
      
      {/* Top Logo - Adapted for SIMS */}
      <div className="flex items-center h-20 px-3 shrink-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-blue-600 rounded-xl shadow-sm ml-0.5 transition-transform group-hover:scale-105">
          <Lightbulb className="h-5 w-5 text-white" />
        </div>
        <div className="ml-4 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
          <span className="text-sm font-bold tracking-wide text-slate-900">Idea Management</span>
          <span className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Enterprise SIMS</span>
        </div>
      </div>

      {/* Primary Action Button (New Suggestion) */}
      <div className="px-3 mt-2">
        <Link href="/sims/new" className="flex items-center h-10 w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors overflow-hidden">
          <div className="flex shrink-0 w-10 items-center justify-center">
            <Plus className="h-5 w-5" />
          </div>
          <span className="ml-2 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            New Suggestion
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-2 px-3 mt-4">
        {filteredNav.map((item) => {
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center h-10 rounded-xl transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-600"
                  : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              }`}
            >
              <div className="flex shrink-0 w-10 items-center justify-center">
                <item.icon className={`h-5 w-5 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
              </div>
              <span className="ml-2 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Navigation */}
      <div className="mb-4 px-3 flex flex-col gap-2">
        {/* Border separator for the footer */}
        <div className="border-t border-slate-100 pt-2 mb-2 w-full"></div>

        <Link
          href="/sims/archived"
          className="flex items-center h-10 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
        >
          <div className="flex shrink-0 w-10 items-center justify-center">
             <Archive className="h-5 w-5" />
          </div>
          <span className="ml-2 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            Archived
          </span>
        </Link>

        <Link
          href="/sims/settings"
          className="flex items-center h-10 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
        >
          <div className="flex shrink-0 w-10 items-center justify-center">
             <Settings className="h-5 w-5" />
          </div>
          <span className="ml-2 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            Settings
          </span>
        </Link>

        {/* Return to Main Dashboard */}
        <Link
          href="/"
          className="flex items-center h-10 mt-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors w-full group/return"
        >
          <div className="flex shrink-0 w-10 items-center justify-center">
             <ArrowLeft className="h-5 w-5 text-slate-400 group-hover/return:text-white transition-colors" />
          </div>
          <span className="ml-2 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            Main App
          </span>
        </Link>
      </div>
    </aside>
  );
}