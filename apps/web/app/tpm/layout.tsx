import { TpmShell } from "@/components/tpm/TpmShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <TpmShell>{children}</TpmShell>;
}
