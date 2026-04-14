import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gemba PMS",
  description: "Precision Engine Employee Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex h-screen overflow-hidden bg-slate-50`}>
        
        <Sidebar />

        <div className="flex flex-1 flex-col overflow-hidden">
          
          {/* Top Header */}
          <Header />

          {/* Main Page Content Area */}
          <main className="flex-1 overflow-y-auto p-8">
            {children} 
          </main>
          
        </div>

      </body>
    </html>
  );
}