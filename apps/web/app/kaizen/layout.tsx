"use client"

import { Header } from "@/components/Header"
import { KaizenSidebar } from "@/components/kaizen/KaizenSidebar"
import { ModuleGuard } from "@/components/ModuleGuard"
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed"
import { useState } from "react"

export default function KaizenLayout({ children }: {children: React.ReactNode}){
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const { collapsed, toggle } = useSidebarCollapsed()
    return(
        <div className="min-h-screen bg-[#F4F7FA] font-sans">
            <KaizenSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={collapsed} onToggle={toggle} />
                <div className={`flex flex-col min-h-screen transition-all duration-300 ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}>
                    <Header onMenuClick={() => setSidebarOpen(true)} />
                    <main className="flex-1 p-4 md:p-6">  
                        <ModuleGuard moduleKey="KAIZEN">{children}</ModuleGuard>
                    </main>
                </div>            
        </div>
    )
}