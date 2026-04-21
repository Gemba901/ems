import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F4F7FA] font-sans">
      {/* Floating Sidebar */}
      <Sidebar />

      {/* Main Content Area (Offset by the collapsed sidebar width) */}
      <div className="pl-24 flex flex-col min-h-screen transition-all duration-300">
        <Header />
        
        <main className="flex-1 p-8">
          {children} 
        </main>
      </div>
    </div>
  );
}