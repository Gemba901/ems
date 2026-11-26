'use client';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from 'react';
import { Search, X } from 'lucide-react';

type PerformanceScoreboardSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function PerformanceScoreboardSearch({
  value,
  onChange,
}: PerformanceScoreboardSearchProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        variant="ghost"
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
        Search person
      </Button>
    );
  }

  return (
    <div className="flex min-w-56 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-info">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Input
        autoFocus
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search name or role"
        aria-label="Search scoreboard by employee name or role"
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      <Button
        variant="ghost"
        type="button"
        aria-label="Close scoreboard search"
        onClick={() => {
          onChange('');
          setOpen(false);
        }}
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
