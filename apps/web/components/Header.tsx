"use client";

import Link from "next/link";
import { Bell, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth.store";

export function Header() {
  const user = useAuthStore((state) => state.user);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <header className="flex h-20 items-center justify-between px-8 bg-transparent">
      <div className="flex items-center gap-12">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          GEOS
        </h1>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-blue-600"></span>
          </button>

          <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <Settings className="h-5 w-5" />
          </button>
        </div>

        <Link
          href={`/operations/employees/${user?.userId}`}
          className="flex items-center gap-3 p-1 rounded-xl transition-all hover:bg-slate-50 group"
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-900 leading-none mb-1 group-hover:text-blue-600 transition-colors">
              {user?.name || "User Account"}
            </p>
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
              {user?.organizationName || "Workspace"}
            </p>
          </div>

          <Avatar className="h-9 w-9 rounded-full border border-slate-200 transition-transform group-hover:scale-105">
            <AvatarImage src="/placeholder.png" alt={user?.name || "User"} />
            <AvatarFallback className="bg-slate-900 text-white text-xs font-bold">
              {user?.name ? getInitials(user.name) : "U"}
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
