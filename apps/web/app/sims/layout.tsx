import { SimsSidebar } from "@/components/sims/SimsSidebar";
import { Header } from "@/components/Header";

export default function SimsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F4F7FA] font-sans">
      <SimsSidebar />
      <div className="pl-24 flex flex-col min-h-screen transition-all duration-300">
        <Header />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
