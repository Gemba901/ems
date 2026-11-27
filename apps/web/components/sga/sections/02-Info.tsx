"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TenantImage } from "@/components/files/TenantImage";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileIcon, ImagePlus, Loader2, X } from "lucide-react";
import { EmployeeService } from "@/services/employee.service";
import { SgaService } from "@/services/sga.service";
import { uploadImage } from "@/services/uploads.service";
import { HelpText, SectionLabel } from "@/components/sga/sga-ui";
import { SpeechToTextButton } from "@/components/ui/SpeechToTextButton";
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

interface InfoSectionProps extends SgaSectionProps {
  onDepartmentSelectionChange?: (mainDepartmentId: string, otherDepartmentIds: string[]) => void;
}

const InfoSection = forwardRef<SgaSectionHandle, InfoSectionProps>(function InfoSection(
  { sga, access, token, onSaved, onDepartmentSelectionChange },
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
  const editable = access.editable;

  const { data: me } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(token),
    enabled: !!token,
  });
  const { data: departments } = useQuery({
    queryKey: ["sga-departments", me?.organizationId],
    queryFn: () => EmployeeService.getDepartments(me!.organizationId, token),
    enabled: !!token && !!me?.organizationId,
  });

  const otherDeptOptions = (departments ?? []).filter((d) => d.id !== mainDepartmentId);

  // Let the parent form know about the department selection as soon as it changes, so
  // the Team section can look up candidates before this section has been saved.
  useEffect(() => {
    onDepartmentSelectionChange?.(mainDepartmentId, otherDepartmentIds);
  }, [mainDepartmentId, otherDepartmentIds, onDepartmentSelectionChange]);

  const appendToProblem = useCallback((transcript: string) => {
    setProblemDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
  }, []);

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
      // Only check what has been entered; missing required fields are listed at submit.
      if (title.trim() && title.trim().length < 5) throw new Error("Title must be at least 5 characters.");
      if (problemDescription.trim() && problemDescription.trim().length < 10) {
        throw new Error("Describe the problem in at least 10 characters.");
      }
      if (startDate && targetCompletionDate && new Date(targetCompletionDate) < new Date(startDate)) {
        throw new Error("Target completion date cannot be before the start date.");
      }
      return SgaService.updateInfo(
        sga.id,
        {
          title: title.trim() || undefined,
          problemDescription: problemDescription.trim() || undefined,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate).toISOString() : undefined,
          mainDepartmentId: mainDepartmentId || undefined,
          otherDepartmentIds: otherDepartmentIds.length ? otherDepartmentIds : undefined,
          workArea: workArea.trim() || undefined,
          beforeFileUrls,
        },
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
      <SectionLabel n="1.2">SGA Information &amp; Problem</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Title <span className="text-danger">*</span>
          </label>
          <Input
            type="text"
            value={title}
            disabled={!editable}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A short, descriptive title"
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all disabled:bg-muted disabled:text-muted-foreground"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-foreground">
              What is the problem? <span className="text-danger">*</span>
            </label>
            {editable && (
              <SpeechToTextButton onResult={appendToProblem} />
            )}
          </div>
          <HelpText>What happens, where, how often, and why it matters. Type or tap the mic to speak.</HelpText>
          <Textarea
            rows={4}
            value={problemDescription}
            disabled={!editable}
            onChange={(e) => setProblemDescription(e.target.value)}
            placeholder="e.g. Line 3 filler stops 4-5 times a shift because bottles jam at the infeed..."
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all resize-none disabled:bg-muted disabled:text-muted-foreground"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5">
              Start Date <span className="text-danger">*</span>
            </label>
            <Input
              type="date"
              value={startDate}
              disabled={!editable}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all disabled:bg-muted disabled:text-muted-foreground"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5">
              Target Completion Date <span className="text-danger">*</span>
            </label>
            <Input
              type="date"
              value={targetCompletionDate}
              min={startDate}
              disabled={!editable}
              onChange={(e) => setTargetCompletionDate(e.target.value)}
              className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all disabled:bg-muted disabled:text-muted-foreground"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Main department <span className="text-danger">*</span>
          </label>
          <NativeSelect
            value={mainDepartmentId}
            disabled={!editable}
            onChange={(e) => {
              setMainDepartmentId(e.target.value);
              setOtherDepartmentIds((prev) => prev.filter((d) => d !== e.target.value));
            }}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all disabled:bg-muted disabled:text-muted-foreground"
          >
            <option value="">Select a department...</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {(editable ? otherDeptOptions.length > 0 : otherDepartmentIds.length > 0) && (
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5">
              Other departments involved <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <div className="border border-border rounded-lg max-h-40 overflow-y-auto divide-y divide-border">
              {(editable ? otherDeptOptions : (departments ?? []).filter((d) => otherDepartmentIds.includes(d.id))).map((d) => (
                <label
                  key={d.id}
                  className={`flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-muted ${editable ? "cursor-pointer" : "cursor-default opacity-80"}`}
                >
                  <Input
                    type="checkbox"
                    checked={otherDepartmentIds.includes(d.id)}
                    disabled={!editable}
                    onChange={() => toggleOtherDepartment(d.id)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-ring/20"
                  />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Work area <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            type="text"
            value={workArea}
            disabled={!editable}
            onChange={(e) => setWorkArea(e.target.value)}
            placeholder="e.g. Line 3, Packing Bay"
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all disabled:bg-muted disabled:text-muted-foreground"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-foreground">
              Photos of the problem (before) <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <span className="text-xs text-muted-foreground">{beforeFileUrls.length}/{MAX_FILES}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {beforeFileUrls.map((url, i) => (
              <div key={url} className="relative rounded-lg overflow-hidden border border-border bg-muted aspect-square">
                {isImageUrl(url) ? (
                  <TenantImage src={url} alt={`Before ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
                    <FileIcon className="h-6 w-6" />
                    <span className="text-[10px]">File {i + 1}</span>
                  </div>
                )}
                {editable && (
                  <Button variant="ghost"
                    type="button"
                    onClick={() => removeFile(i)}
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-overlay/60 hover:bg-overlay/80 flex items-center justify-center text-primary-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {editable && beforeFileUrls.length < MAX_FILES && (
              <Button variant="ghost"
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-all disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                {uploading ? "Uploading..." : "Add photo"}
              </Button>
            )}
          </div>
          {editable && <Input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple onChange={handleFileChange} className="hidden" />}
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

export default InfoSection;
