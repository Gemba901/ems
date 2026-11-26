"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { EmployeeService } from "@/services/employee.service";
import { SgaService } from "@/services/sga.service";
import { SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const VerifyingDepartmentSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function VerifyingDepartmentSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [verifyingDepartmentId, setVerifyingDepartmentId] = useState(sga.verifyingDepartmentId ?? "");
  const [departmentRepId, setDepartmentRepId] = useState(sga.departmentRepId ?? "");
  const [error, setError] = useState<string | null>(null);
  const editable = access.editable;

  const { data: me } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(token),
    enabled: !!token && editable,
  });
  const { data: departments } = useQuery({
    queryKey: ["employee-departments", me?.organizationId],
    queryFn: () => EmployeeService.getDepartments(me!.organizationId, token),
    enabled: !!token && editable && !!me?.organizationId,
  });
  const { data: colleagues } = useQuery({
    queryKey: ["employee-colleagues"],
    queryFn: () => EmployeeService.getMyColleagues(token),
    enabled: !!token && editable && !!me?.departmentId,
  });

  const departmentOptions = editable ? departments ?? [] : sga.verifyingDepartment ? [sga.verifyingDepartment] : [];
  const repOptions = editable ? colleagues ?? [] : sga.departmentRep ? [sga.departmentRep] : [];

  const mutation = useMutation({
    mutationFn: () => {
      if (!verifyingDepartmentId) throw new Error("Please select a verifying department.");
      return SgaService.updateVerifyingDepartment(
        sga.id,
        { verifyingDepartmentId, departmentRepId: departmentRepId || undefined },
        token,
      );
    },
    onSuccess: (updated) => onSaved(updated),
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Failed to save"),
  });

  useImperativeHandle(ref, () => ({
    save: async () => {
      try {
        await mutation.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
  }));

  return (
    <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n="6.1">Verifying Department</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Verifying department <span className="text-danger">*</span>
          </label>
          <NativeSelect
            value={verifyingDepartmentId}
            disabled={!editable}
            onChange={(e) => setVerifyingDepartmentId(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all disabled:bg-muted disabled:text-muted-foreground"
          >
            <option value="">Select a department...</option>
            {departmentOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Department representative <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <NativeSelect
            value={departmentRepId}
            disabled={!editable}
            onChange={(e) => setDepartmentRepId(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all disabled:bg-muted disabled:text-muted-foreground"
          >
            <option value="">Select a representative...</option>
            {repOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </NativeSelect>
        </div>
        {error && <p className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default VerifyingDepartmentSection;
