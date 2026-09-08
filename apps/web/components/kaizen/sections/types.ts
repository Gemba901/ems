import { Kaizen } from "@/services/kaizen.service";
import { SectionAccess } from "@/components/kaizen/gating";

export interface KaizenSectionProps {
  kaizen: Kaizen;
  access: SectionAccess;
  token: string;
  onSaved: (updated: Kaizen) => void;
}

export interface KaizenSectionHandle {
  save: () => Promise<boolean>;
}
