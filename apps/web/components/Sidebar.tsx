"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutGrid,
  IdCard,
  Building2,
  Settings,
  HelpCircle,
  LogOut,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  // Top navigation links
  const mainNav = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutGrid },
    { name: "Employees", href: "/employees", icon: IdCard },
    { name: "Departments", href: "/departments", icon: Building2 },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <aside className="flex h-screen w-64 flex-col bg-[#263140] text-slate-400 shadow-xl">
      {/* 1. Header & Logo area */}
      <div className="flex items-center gap-4 px-6 py-8">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-white rounded shadow-sm">
          {/* Using a placeholder shape for custom logo */}
          <div className="text-[#a3e635] font-bold text-xl">N</div> 
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-semibold tracking-wide text-white">
            Gemba PMS
          </span>
          <span className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            Precision Engine
          </span>
        </div>
      </div>

      {/* 2. Main Navigation */}
      <nav className="flex-1 space-y-1 mt-4">
        {mainNav.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-4 px-6 py-3 transition-colors ${
                isActive
                  ? "bg-[#334155] text-[#a3e635] border-r-4 border-[#a3e635]"
                  : "hover:bg-[#334155]/50 hover:text-slate-200 border-r-4 border-transparent"
              }`}
            >
              <item.icon className={`h-5 w-5 ${isActive ? "text-[#a3e635]" : "text-slate-500"}`} />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* 3. Footer Navigation (Support & Logout) */}
      <div className="mb-8 space-y-1">
        <Link
          href="/support"
          className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-[#334155]/50 hover:text-slate-200 border-r-4 border-transparent"
        >
          <HelpCircle className="h-5 w-5 text-slate-500" />
          <span className="font-medium">Support</span>
        </Link>
        
        <button
          onClick={() => {
            // Add logout logic here
            console.log("Logging out...");
          }}
          className="flex w-full items-center gap-4 px-6 py-3 transition-colors hover:bg-[#334155]/50 hover:text-slate-200 border-r-4 border-transparent text-left"
        >
          <LogOut className="h-5 w-5 text-slate-500" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </aside>
  );
}