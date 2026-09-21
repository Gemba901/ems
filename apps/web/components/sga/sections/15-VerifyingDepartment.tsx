"use client";

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

  const { data: me } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(token),
    enabled: !!token && access.editable,
  });
  const { data: departments } = useQuery({
    queryKey: ["employee-departments", me?.organizationId],
    queryFn: () => EmployeeService.getDepartments(me!.organizationId, token),
    enabled: !!token && access.editable && !!me?.organizationId,
  });
  const { data: colleagues } = useQuery({
    queryKey: ["employee-colleagues"],
    queryFn: () => EmployeeService.getMyColleagues(token),
    enabled: !!token && access.editable && !!me?.departmentId,
  });

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
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to save"),
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

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n="6.1">Verifying Department</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Verifying Department</p>
            <p className="text-sm text-slate-700">{sga.verifyingDepartment?.name || "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Department Representative</p>
            <p className="text-sm text-slate-700">
              {sga.departmentRep ? `${sga.departmentRep.firstName} ${sga.departmentRep.lastName}` : "Not set"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="6.1">Verifying Department</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Verifying department <span className="text-red-500">*</span>
          </label>
          <select
            value={verifyingDepartmentId}
            onChange={(e) => setVerifyingDepartmentId(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          >
            <option value="">Select a department...</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Department representative <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <select
            value={departmentRepId}
            onChange={(e) => setDepartmentRepId(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          >
            <option value="">Select a representative...</option>
            {(colleagues ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default VerifyingDepartmentSection;
