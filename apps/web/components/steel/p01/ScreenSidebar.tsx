interface Props {
  children: React.ReactNode;
}

// Shared visual shell for the S1-S6 right sidebar — layout only. Each
// screen supplies its own cards (About/Plan Summary/What's Next/Tips etc.)
// as children.
export function ScreenSidebar({ children }: Props) {
  return <div className="space-y-4">{children}</div>;
}
