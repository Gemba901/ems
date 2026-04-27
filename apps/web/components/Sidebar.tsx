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
  MessageSquareText,
} from "lucide-react";
import { useAuthStore } from "../store/auth.store";
import { useEffect } from "react";
import { Role } from "@/types/role";

export function Sidebar() {
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
      name: "Team Directory", 
      href: "/employees", 
      icon: Users,
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

  return (
    <aside className="fixed left-4 top-4 bottom-4 z-50 flex flex-col bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 transition-all duration-300 ease-in-out w-16 hover:w-64 group overflow-hidden">
      
      {/* Top Logo */}
      <div className="flex items-center h-20 px-3 shrink-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-blue-600 rounded-xl shadow-sm ml-0.5 transition-transform group-hover:scale-105">
          <Box className="h-5 w-5 text-white" />
        </div>
        <div className="ml-4 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
          <span className="text-sm font-bold tracking-wide text-slate-900">{user?.organizationName || "Workspace"}</span>
          <span className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Workspace</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-2 px-3 mt-4">
        {/* 3. Map over the FILTERED navigation, not the mainNav */}
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

      {/* Footer Support - Visible to everyone */}
       <div className="mb-4 px-3">
        <Link
          href="/support"
          className="flex items-center h-10 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
        >
          <div className="flex shrink-0 w-10 items-center justify-center">
             <HelpCircle className="h-5 w-5" />
          </div>
          <span className="ml-2 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            Support
          </span>
        </Link>

        <button
          onClick={handleLogout}
          className="flex items-center h-10 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors w-full"
        >
          <div className="flex shrink-0 w-10 items-center justify-center">
             <LogOut className="h-5 w-5" />
          </div>
          <span className="ml-2 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            Logout
          </span>
        </button>
      </div>
    </aside>
  );
}