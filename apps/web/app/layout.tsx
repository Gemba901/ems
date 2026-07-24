import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/contexts/toast.context";
import { QueryProvider } from "@/contexts/QueryProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gemba PMS",
  description: "Precision Engine Employee Management System",
  manifest: "/manifest.json",
  applicationName: "Gemba PMS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gemba PMS",
  },
  icons: [
    {
      rel: "icon",
      url: "/icon.svg",
    },
    {
      rel: "apple-touch-icon",
      url: "/logo.png",
    },
  ],
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 text-slate-900`}>
        <QueryProvider>
          <ToastProvider>{children}</ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
