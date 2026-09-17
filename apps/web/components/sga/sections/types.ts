import { Sga } from "@/services/sga.service";
import { SectionAccess } from "@/components/sga/gating";

export interface SgaSectionProps {
  sga: Sga;
  access: SectionAccess;
  token: string;
  onSaved: (updated: Sga) => void;
}

export interface SgaSectionHandle {
  save: () => Promise<boolean>;
}
