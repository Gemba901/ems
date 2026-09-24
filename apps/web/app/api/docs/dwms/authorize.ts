import "server-only";
import { authorizeModuleDocs } from "@/lib/docs/authorize";

export function authorizeDwmsDocs(request: Request): Promise<Response | null> {
  return authorizeModuleDocs(request, "DWMS");
}
