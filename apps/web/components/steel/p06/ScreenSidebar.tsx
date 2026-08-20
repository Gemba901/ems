interface Props {
  children: React.ReactNode;
}

// Shared visual shell for the P06 S1-S3 right sidebar — layout only. Each
// screen supplies its own cards (About/Context/Tips etc.) as children.
// Mirrors components/steel/p05/ScreenSidebar.tsx.
export function ScreenSidebar({ children }: Props) {
  return <div className="space-y-4">{children}</div>;
}
