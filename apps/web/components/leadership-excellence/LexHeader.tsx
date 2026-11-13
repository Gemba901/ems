"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/Header";
import { getLexArea } from "./lex-navigation";

/** Use the platform header, retaining its calendar, notifications and profile. */
export function LexHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const area = getLexArea(pathname);
  const page = area?.items.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <Header
      onMenuClick={onMenuClick}
      title={page?.label || area?.label || "Leadership Excellence"}
    />
  );
}
