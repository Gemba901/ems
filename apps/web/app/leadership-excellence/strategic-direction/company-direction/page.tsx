"use client";

import { useState } from "react";
import type { DirectionProblem } from "@/services/leadership-excellence/strategic-direction.service";
import { useAuthStore, Role } from "@/store/auth.store";
import {
  useApprovedDirection,
  useDirectionActions,
  useDirectionDraft,
} from "@/hooks/leadership-excellence/useStrategicDirection";
import { CompanyDirectionEditor } from "@/components/leadership-excellence/strategic-direction/CompanyDirectionEditor";
import { DirectionReadView } from "@/components/leadership-excellence/strategic-direction/DirectionReadView";
import { PillarsSection } from "@/components/leadership-excellence/strategic-direction/PillarsSection";
import { DirectionStatusBadge, formatDate } from "@/components/leadership-excellence/strategic-direction/ui";

// Mirror apps/api/src/leadership-excellence/common/lex-roles.ts. The API enforces them again.
const APPROVERS: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];
const EDITORS: Role[] = [...APPROVERS, Role.HR, Role.HOD];

// Element ids for the read view, matching the editor's section ids.
const READ_ANCHORS = {
  organisation: "organisation",
  vision: "vision-section",
  mission: "mission-section",
  values: "values-section",
};

function Heading({ title, intro, badge }: { title: string; intro: string; badge?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Area 01 · Strategic Direction
        </div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      {badge}
    </div>
  );
}

const Message = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">{children}</p>
);

function EmployeeView() {
  const approved = useApprovedDirection();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Heading
        title="Our company direction."
        intro="Read the current approved wording. Drafts and revisions are not published until management approves them."
      />
      {approved.isPending ? (
        <Message>Loading…</Message>
      ) : approved.isError ? (
        <Message>Could not load the company direction. {(approved.error as Error).message}</Message>
      ) : approved.data ? (
        <DirectionReadView
          content={approved.data}
          eyebrow={`Approved company direction · Version ${approved.data.version}`}
          summary={`Approved${approved.data.approvedByName ? ` by ${approved.data.approvedByName}` : ""} · ${formatDate(approved.data.approvedAt)}.`}
          anchors={READ_ANCHORS}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold">No approved company direction yet</h2>
          <p className="text-sm text-muted-foreground">
            Management is preparing the direction. Its approved version will appear here after finalisation.
          </p>
        </div>
      )}
      <PillarsSection />
    </div>
  );
}

function EditorView({ canApprove }: { canApprove: boolean }) {
  const draft = useDirectionDraft();
  const actions = useDirectionActions();
  const [problems, setProblems] = useState<DirectionProblem[]>([]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Heading
        title="Write your company direction."
        intro="Enter your purpose, vision, mission and values below. You can save your work at any stage."
        badge={draft.data && <DirectionStatusBadge status={draft.data.status} hasApproved={!!draft.data.approved} />}
      />
      {draft.isPending ? (
        <Message>Loading…</Message>
      ) : draft.isError ? (
        <Message>Could not load the draft. {(draft.error as Error).message}</Message>
      ) : (
        // Remount from the server copy after every successful change.
        <CompanyDirectionEditor
          key={`${draft.data.id ?? "new"}-${draft.data.updatedAt ?? ""}-${draft.data.status}`}
          draft={draft.data}
          canApprove={canApprove}
          actions={actions}
          problems={problems}
          setProblems={setProblems}
        />
      )}
    </div>
  );
}

/** Area 01 · Strategic Direction — one scrollable page: 01.01 direction, 01.02 pillars, 01.03 review. */
export default function StrategicDirectionPage() {
  const role = useAuthStore((s) => s.user?.roleLevel);
  if (!role) return null;
  if (!EDITORS.includes(role)) return <EmployeeView />;
  return <EditorView canApprove={APPROVERS.includes(role)} />;
}
