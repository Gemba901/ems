"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAddComment, useTaskComments } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { formatDateTime, initials } from "@/lib/work/format";
import { ErrorNote, errorMessage } from "@/components/work/ui";

export function TaskComments({ taskId }: { taskId: string }) {
  const comments = useTaskComments(taskId);
  const add = useAddComment(taskId);
  const timeZone = useAuthStore((s) => s.user?.organizationTimeZone) || "UTC";
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const items = comments.data?.items ?? [];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setError(null);
    try {
      await add.mutateAsync(text);
      setBody("");
    } catch (err) {
      setError(errorMessage(err, "Your comment was not posted."));
    }
  }

  return (
    <section aria-labelledby="task-comments-heading" className="space-y-3">
      <h3 id="task-comments-heading" className="text-sm font-semibold text-foreground">
        Comments {items.length > 0 && <span className="font-normal text-muted-foreground">({items.length})</span>}
      </h3>
      {comments.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      ) : comments.isError ? (
        <ErrorNote>{errorMessage(comments.error)}</ErrorNote>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="flex gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
                aria-hidden="true"
              >
                {initials(c.author?.name ?? "?")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{c.author?.name ?? "Former employee"}</span> ·{" "}
                  {formatDateTime(c.createdAt, timeZone)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={onSubmit} className="space-y-2">
        <label htmlFor={`comment-${taskId}`} className="block text-sm font-medium text-foreground">
          Add a comment
        </label>
        <Textarea
          id={`comment-${taskId}`}
          rows={3}
          maxLength={5000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end">
          <Button variant="default" type="submit" disabled={!body.trim() || add.isPending}>
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Post comment
          </Button>
        </div>
      </form>
    </section>
  );
}
