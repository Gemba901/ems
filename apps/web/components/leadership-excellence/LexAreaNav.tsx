"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getLexArea, LEX_AREAS } from "./lex-navigation";

export function LexAreaNav() {
  const pathname = usePathname();
  const active = getLexArea(pathname);
  const navigation = useRef<HTMLElement>(null);

  function reveal(link: HTMLElement) {
    const container = navigation.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    // Only move this horizontal strip. scrollIntoView would also move the page
    // and could jump away from an open planning form when its route changes.
    if (item.left < bounds.left + 8)
      container.scrollLeft += item.left - bounds.left - 8;
    else if (item.right > bounds.right - 8)
      container.scrollLeft += item.right - bounds.right + 8;
  }

  useEffect(() => {
    const link = navigation.current?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    if (!link) return;
    reveal(link);
    const resize = new ResizeObserver(() => reveal(link));
    if (navigation.current) resize.observe(navigation.current);
    return () => resize.disconnect();
  }, [active?.id]);

  return (
    <nav
      ref={navigation}
      aria-label="Leadership Excellence functional areas"
      className="flex min-w-0 items-stretch gap-1 overflow-x-auto overscroll-x-contain border-b border-slate-200 bg-white px-3 [scrollbar-width:thin] sm:px-4 lg:px-8"
    >
      <strong className="mr-3 hidden shrink-0 items-center whitespace-nowrap text-[10px] font-semibold tracking-wider text-slate-400 xl:flex">
        PILLAR 01
      </strong>
      {LEX_AREAS.map((area) => (
        <Link
          key={area.id}
          href={area.href}
          prefetch={false}
          title={`Key Functional Area ${Number(area.id)} — ${area.name}`}
          aria-current={active?.id === area.id ? "page" : undefined}
          onFocus={(event) => reveal(event.currentTarget)}
          className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-indigo-500 ${active?.id === area.id ? "border-indigo-600 bg-indigo-50/50 text-indigo-700" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
        >
          {area.id} · {area.label}
        </Link>
      ))}
    </nav>
  );
}
