interface Props {
  children: React.ReactNode;
}

// Shared visual shell for the P03 S1-S3 right sidebar — layout only. Each
// screen supplies its own cards (About/Context/Tips etc.) as children.
// Mirrors components/steel/p02/ScreenSidebar.tsx.
export function ScreenSidebar({ children }: Props) {
  return <div className="space-y-4">{children}</div>;
}
