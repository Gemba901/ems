"use client";

import { AlertTriangle, CheckCircle2, Clock, Hand } from "lucide-react";
import { Sga } from "@/services/sga.service";
import { canActOnVerificationStage, SgaAccessContext, SgaGating } from "@/components/sga/gating";

type Tone = "action" | "waiting" | "returned" | "done";

const TONE_CLASS: Record<Tone, string> = {
  action: "bg-indigo-50 border-indigo-200 text-indigo-900",
  waiting: "bg-slate-50 border-slate-200 text-slate-700",
  returned: "bg-orange-50 border-orange-200 text-orange-900",
  done: "bg-emerald-50 border-emerald-200 text-emerald-900",
};

const TONE_ICON: Record<Tone, React.ReactNode> = {
  action: <Hand className="h-4 w-4 shrink-0 mt-0.5" />,
  waiting: <Clock className="h-4 w-4 shrink-0 mt-0.5" />,
  returned: <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />,
  done: <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />,
};

interface NextAction {
  tone: Tone;
  message: string;
  remarks?: string | null;
}

function getNextAction(sga: Sga, ctx: SgaAccessContext, gating: SgaGating): NextAction {
  const raiser = `${sga.employee.firstName} ${sga.employee.lastName}`;
  const hod = sga.mainDepartment ? `the ${sga.mainDepartment.name} HOD` : "the HOD";
  const isTeam = ctx.isRaiser || ctx.isOwner || ctx.isTeamMember;

  switch (sga.status) {
    case "DRAFT":
      return ctx.isRaiser
        ? { tone: "action", message: "Your turn: finish the draft, then submit it to your HOD for approval." }
        : { tone: "waiting", message: `Draft: ${raiser} is still preparing this SGA.` };
    case "RETURNED_FOR_REVISION":
      return ctx.isRaiser
        ? { tone: "returned", message: `Returned by ${hod}. Update the draft using their remarks and submit again.`, remarks: sga.hodRemarks }
        : { tone: "waiting", message: `Returned to ${raiser} for changes.`, remarks: sga.hodRemarks };
    case "PENDING_HOD_APPROVAL":
      return gating.hodApproval.editable
        ? { tone: "action", message: "Your turn: review this SGA and approve it or send it back." }
        : { tone: "waiting", message: `Waiting for approval from ${hod}.` };
    case "REJECTED":
      return { tone: "returned", message: `Rejected by ${hod}.`, remarks: sga.hodRemarks };
    case "IN_PROGRESS":
      return isTeam
        ? { tone: "action", message: "Your turn: record meetings, find the root cause, carry out the actions and check the results. Then submit for verification." }
        : { tone: "waiting", message: "In progress: the team is working on this SGA." };
    case "RETURNED_FOR_REWORK":
      return isTeam
        ? { tone: "returned", message: "Returned for rework. See the verification remarks below, fix the gaps and submit again." }
        : { tone: "waiting", message: "Returned to the team for rework." };
    case "PENDING_VERIFICATION": {
      const canAct = sga.verifications.some((v) => canActOnVerificationStage(sga, v.stage, ctx));
      return canAct
        ? { tone: "action", message: "Your turn: check the results and record your verification decision below." }
        : { tone: "waiting", message: "Waiting for verification of the results." };
    }
    case "VERIFIED_CLOSED":
      return { tone: "done", message: "Verified and closed. Well done to the team." };
    default:
      return { tone: "waiting", message: "" };
  }
}

export default function NextActionBanner({ sga, ctx, gating }: { sga: Sga; ctx: SgaAccessContext; gating: SgaGating }) {
  const { tone, message, remarks } = getNextAction(sga, ctx, gating);
  if (!message) return null;
  return (
    <div role="status" className={`flex gap-2.5 border rounded-xl px-4 py-3 text-sm ${TONE_CLASS[tone]}`}>
      {TONE_ICON[tone]}
      <div className="min-w-0">
        <p className="font-medium">{message}</p>
        {remarks && <p className="mt-1 text-xs opacity-80 italic break-words">&ldquo;{remarks}&rdquo;</p>}
      </div>
    </div>
  );
}
