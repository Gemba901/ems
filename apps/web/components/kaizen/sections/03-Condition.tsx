"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TenantFileLink } from "@/components/files/TenantFileLink";
import { TenantImage } from "@/components/files/TenantImage";
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileIcon, ImagePlus, Loader2, X } from "lucide-react";
import { KaizenService } from "@/services/kaizen.service";
import { uploadImage } from "@/services/uploads.service";
import { HelpText, SectionLabel } from "@/components/kaizen/kaizen-ui";
import { SpeechToTextButton } from "@/components/ui/SpeechToTextButton";
import { KaizenSectionHandle, KaizenSectionProps } from "./types";

const MAX_FILES = 8;

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
}

const ConditionSection = forwardRef<KaizenSectionHandle, KaizenSectionProps>(function ConditionSection(
  { kaizen, access, token, onSaved },
  ref,
) {
  const [title, setTitle] = useState(kaizen.title ?? "");
  const [description, setDescription] = useState(kaizen.conditionDescription ?? "");
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>(kaizen.conditionEvidenceUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (evidenceUrls.length + files.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} files.`);
      return;
    }
    try {
      setUploading(true);
      const uploaded = await Promise.all(files.map((file) => uploadImage(file, "kaizen", token)));
      setEvidenceUrls((prev) => [...prev, ...uploaded.map((u) => u.fileUrl)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const appendToDescription = useCallback((transcript: string) => {
    setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
  }, []);

  const removeFile = (index: number) => {
    setEvidenceUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: () => {
      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();
      if (trimmedTitle && trimmedTitle.length < 5) throw new Error("Title must be at least 5 characters.");
      if (trimmedDescription && trimmedDescription.length < 10) {
        throw new Error("Describe what you saw in at least 10 characters.");
      }
      return KaizenService.updateCondition(
        kaizen.id,
        {
          title: trimmedTitle || undefined,
          conditionDescription: trimmedDescription || undefined,
          conditionEvidenceUrls: evidenceUrls,
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

  if (!access.editable) {
    return (
      <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
        <SectionLabel n="1.3">Condition or Opportunity</SectionLabel>
        <p className="text-sm text-foreground whitespace-pre-wrap mb-4">{kaizen.conditionDescription}</p>
        {kaizen.conditionEvidenceUrls.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kaizen.conditionEvidenceUrls.map((url, i) =>
              isImageUrl(url) ? (
                <TenantFileLink key={url} href={url} target="_blank" rel="noreferrer" className="rounded-lg overflow-hidden border border-border aspect-square block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <TenantImage src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                </TenantFileLink>
              ) : (
                <TenantFileLink
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border aspect-square flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
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
    <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n="1.3">What you saw</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">Short title</label>
          <HelpText>A few words someone can recognise in a list, e.g. &quot;Label the spill kit&quot;.</HelpText>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A short, descriptive title"
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="text-sm font-semibold text-foreground">What is the problem or idea?</label>
            <SpeechToTextButton onResult={appendToDescription} />
          </div>
          <HelpText>What you saw, where, and why it matters. Type or tap the mic to speak.</HelpText>
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. The spill kit is behind boxes, so it takes minutes to find during a spill."
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all resize-none"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-foreground">
              Photos or files <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <span className="text-xs text-muted-foreground">{evidenceUrls.length}/{MAX_FILES}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {evidenceUrls.map((url, i) => (
              <div key={url} className="relative rounded-lg overflow-hidden border border-border bg-muted aspect-square">
                {isImageUrl(url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <TenantImage src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
                    <FileIcon className="h-6 w-6" />
                    <span className="text-[10px]">File {i + 1}</span>
                  </div>
                )}
                <Button variant="ghost"
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-overlay/60 hover:bg-overlay/80 flex items-center justify-center text-primary-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {evidenceUrls.length < MAX_FILES && (
              <Button variant="ghost"
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square h-auto w-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-all disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                {uploading ? "Uploading..." : "Add file"}
              </Button>
            )}
          </div>
          <Input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
        </div>
        {error && <p role="alert" className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default ConditionSection;
