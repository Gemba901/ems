import { Search, Bell, Grid3x3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
      
      {/* 1. Search Bar Area */}
      <div className="flex w-full max-w-2xl items-center">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="Search employees, IDs, or roles..."
            className="h-10 w-full rounded-xl border-transparent bg-slate-100 pl-11 text-slate-700 shadow-none focus-visible:ring-1 focus-visible:ring-slate-300"
          />
        </div>
      </div>

      {/* 2. Utility Icons & Profile Area */}
      <div className="flex items-center gap-6">
        
        {/* Icons */}
        <div className="flex items-center gap-4">
          <button className="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100">
            <Bell className="h-6 w-6" />
            {/* Notification Dot */}
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-orange-600"></span>
          </button>
          
          <button className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100">
            <Grid3x3 className="h-6 w-6" />
          </button>
        </div>

        {/* Vertical Divider */}
        <div className="h-8 w-px bg-slate-200"></div>

        {/* User Profile */}
        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="text-right">
            {/* Note: In the future, this will be dynamically populated from your JWT req.user */}
            <p className="text-sm font-bold text-slate-900">Rodgers Munene</p>
            <p className="text-xs font-medium text-slate-500">Business Excellence</p>
          </div>
          
          {/* Avatar with the dark green border styling from your mockup */}
          <div className="rounded-xl border-1 border-[#3B4C43] p-0.5">
            <Avatar className="h-10 w-10 rounded-lg">
              <AvatarImage src="/placeholder-avatar.png" alt="Rodgers Munene" />
              <AvatarFallback className="rounded-lg bg-slate-200 text-slate-600 font-bold">
                RM
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

      </div>
    </header>
  );
}