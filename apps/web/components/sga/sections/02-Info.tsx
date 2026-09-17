"use client";

import { TenantFileLink } from "@/components/files/TenantFileLink";
import { TenantImage } from "@/components/files/TenantImage";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileIcon, ImagePlus, Loader2, X } from "lucide-react";
import { EmployeeService } from "@/services/employee.service";
import { SgaService } from "@/services/sga.service";
import { uploadImage } from "@/services/uploads.service";
import { formatDate, SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const MAX_FILES = 8;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function toIsoDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
}

const InfoSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function InfoSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [title, setTitle] = useState(sga.title ?? "");
  const [problemDescription, setProblemDescription] = useState(sga.problemDescription ?? "");
  const [startDate, setStartDate] = useState(toIsoDateInput(sga.startDate) || todayIsoDate());
  const [targetCompletionDate, setTargetCompletionDate] = useState(toIsoDateInput(sga.targetCompletionDate));
  const [mainDepartmentId, setMainDepartmentId] = useState(sga.mainDepartmentId ?? "");
  const [otherDepartmentIds, setOtherDepartmentIds] = useState<string[]>(sga.otherDepartments.map((d) => d.id));
  const [workArea, setWorkArea] = useState(sga.workArea ?? "");
  const [beforeFileUrls, setBeforeFileUrls] = useState<string[]>(sga.beforeFileUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: me } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(token),
    enabled: !!token && access.editable,
  });
  const { data: departments } = useQuery({
    queryKey: ["sga-departments", me?.organizationId],
    queryFn: () => EmployeeService.getDepartments(me!.organizationId, token),
    enabled: !!token && access.editable && !!me?.organizationId,
  });

  const otherDeptOptions = (departments ?? []).filter((d) => d.id !== mainDepartmentId);

  const toggleOtherDepartment = (id: string) => {
    setOtherDepartmentIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (beforeFileUrls.length + files.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} files.`);
      return;
    }
    try {
      setUploading(true);
      const uploaded = await Promise.all(files.map((file) => uploadImage(file, "sga", token)));
      setBeforeFileUrls((prev) => [...prev, ...uploaded.map((u) => u.fileUrl)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setBeforeFileUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (title.trim().length < 5) throw new Error("Title must be at least 5 characters.");
      if (problemDescription.trim().length < 10) throw new Error("Describe the problem in at least 10 characters.");
      if (!startDate) throw new Error("Please set a start date.");
      if (!targetCompletionDate) throw new Error("Please set a target completion date.");
      if (new Date(targetCompletionDate) < new Date(startDate)) {
        throw new Error("Target completion date cannot be before the start date.");
      }
      return SgaService.updateInfo(
        sga.id,
        {
          title: title.trim(),
          problemDescription: problemDescription.trim(),
          startDate: new Date(startDate).toISOString(),
          targetCompletionDate: new Date(targetCompletionDate).toISOString(),
          mainDepartmentId: mainDepartmentId || undefined,
          otherDepartmentIds: otherDepartmentIds.length ? otherDepartmentIds : undefined,
          workArea: workArea.trim() || undefined,
          beforeFileUrls,
        },
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
        <SectionLabel n="1.2">SGA Information &amp; Problem</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Title</p>
            <p className="text-sm text-slate-700">{sga.title || "Untitled"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Problem Description</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{sga.problemDescription || "Not set."}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Start Date</p>
            <p className="text-sm text-slate-700">{sga.startDate ? formatDate(sga.startDate) : "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Target Completion</p>
            <p className="text-sm text-slate-700">{sga.targetCompletionDate ? formatDate(sga.targetCompletionDate) : "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Main Department</p>
            <p className="text-sm text-slate-700">{sga.mainDepartment?.name ?? "Not set"}</p>
          </div>
          {sga.otherDepartments.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Other Departments</p>
              <p className="text-sm text-slate-700">{sga.otherDepartments.map((d) => d.name).join(", ")}</p>
            </div>
          )}
          {sga.workArea && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Work Area</p>
              <p className="text-sm text-slate-700">{sga.workArea}</p>
            </div>
          )}
        </div>
        {sga.beforeFileUrls.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {sga.beforeFileUrls.map((url, i) =>
              isImageUrl(url) ? (
                <TenantFileLink key={url} href={url} target="_blank" rel="noreferrer" className="rounded-lg overflow-hidden border border-slate-100 aspect-square block">
                  <TenantImage src={url} alt={`Before ${i + 1}`} className="w-full h-full object-cover" />
                </TenantFileLink>
              ) : (
                <TenantFileLink
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-200 aspect-square flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-blue-500 hover:border-blue-300 transition-colors"
                >
                  <FileIcon className="h-6 w-6" />
                  <span className="text-[10px]">File {i + 1}</span>
                </TenantFileLink>
              ),
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="1.2">SGA Information &amp; Problem</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A short, descriptive title"
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Problem description <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            value={problemDescription}
            onChange={(e) => setProblemDescription(e.target.value)}
            placeholder="Describe the problem this SGA addresses..."
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Target Completion Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={targetCompletionDate}
              min={startDate}
              onChange={(e) => setTargetCompletionDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Main department <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <select
            value={mainDepartmentId}
            onChange={(e) => {
              setMainDepartmentId(e.target.value);
              setOtherDepartmentIds((prev) => prev.filter((d) => d !== e.target.value));
            }}
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
        {otherDeptOptions.length > 0 && (
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Other departments involved <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
              {otherDeptOptions.map((d) => (
                <label key={d.id} className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={otherDepartmentIds.includes(d.id)}
                    onChange={() => toggleOtherDepartment(d.id)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                  />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Work area <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            value={workArea}
            onChange={(e) => setWorkArea(e.target.value)}
            placeholder="e.g. Line 3, Packing Bay"
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-slate-700">
              Before files <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <span className="text-xs text-slate-400">{beforeFileUrls.length}/{MAX_FILES}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {beforeFileUrls.map((url, i) => (
              <div key={url} className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
                {isImageUrl(url) ? (
                  <TenantImage src={url} alt={`Before ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-400">
                    <FileIcon className="h-6 w-6" />
                    <span className="text-[10px]">File {i + 1}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-slate-900/60 hover:bg-slate-900/80 flex items-center justify-center text-white transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {beforeFileUrls.length < MAX_FILES && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                {uploading ? "Uploading..." : "Add file"}
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
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

export default InfoSection;
