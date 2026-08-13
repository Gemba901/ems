interface Props {
  children: React.ReactNode;
}

// Shared visual shell for the P02 S1-S5 right sidebar — layout only. Each
// screen supplies its own cards (About/Plan Summary/What's Next/Tips etc.)
// as children. Mirrors components/steel/p01/ScreenSidebar.tsx.
export function ScreenSidebar({ children }: Props) {
  return <div className="space-y-4">{children}</div>;
}
