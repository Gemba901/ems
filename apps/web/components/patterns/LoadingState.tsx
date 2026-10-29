import { LoaderCircle } from "lucide-react";
export function LoadingState({
  label = "Loading records…",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-control p-card text-body text-muted-foreground"
    >
      <LoaderCircle
        aria-hidden="true"
        className="size-5 animate-spin motion-reduce:animate-none"
      />
      {label}
    </div>
  );
}
