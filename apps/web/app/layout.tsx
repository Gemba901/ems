// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/contexts/toast.context";

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
      <body className={`${inter.className} bg-slate-50 text-slate-900`}>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}