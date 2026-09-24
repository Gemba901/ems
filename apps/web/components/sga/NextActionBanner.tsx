"use client";

import { AlertTriangle, CheckCircle2, Clock, Hand } from "lucide-react";
import { Sga } from "@/services/sga.service";
import { canActOnVerificationStage, SgaAccessContext, SgaGating } from "@/components/sga/gating";

type Tone = "action" | "waiting" | "returned" | "done";

const TONE_STYLE: Record<Tone, { label: string; chip: string; icon: string }> = {
  action: { label: "Your turn", chip: "bg-indigo-50 text-indigo-700", icon: "text-indigo-600" },
  waiting: { label: "Waiting", chip: "bg-slate-100 text-slate-600", icon: "text-slate-500" },
  returned: { label: "Returned", chip: "bg-orange-50 text-orange-700", icon: "text-orange-600" },
  done: { label: "Closed", chip: "bg-emerald-50 text-emerald-700", icon: "text-emerald-600" },
};

const TONE_ICON: Record<Tone, React.ReactNode> = {
  action: <Hand className="h-4 w-4" />,
  waiting: <Clock className="h-4 w-4" />,
  returned: <AlertTriangle className="h-4 w-4" />,
  done: <CheckCircle2 className="h-4 w-4" />,
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

// An information card that sits under the SGA summary and says who acts next.
export default function NextActionBanner({
  sga,
  ctx,
  gating,
  className = "",
}: {
  sga: Sga;
  ctx: SgaAccessContext;
  gating: SgaGating;
  className?: string;
}) {
  const { tone, message, remarks } = getNextAction(sga, ctx, gating);
  if (!message) return null;
  const style = TONE_STYLE[tone];
  return (
    <div role="status" className={`bg-white border border-slate-100 rounded-xl shadow-sm p-5 space-y-3 h-fit ${className}`}>
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-indigo-100">
        <h3 className="text-sm font-semibold text-indigo-600">What&apos;s next</h3>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.chip}`}>
          <span className={style.icon}>{TONE_ICON[tone]}</span>
          {style.label}
        </span>
      </div>
      {/* The chip already says "Your turn", so the message drops that prefix. */}
      <p className="text-sm leading-relaxed text-slate-700">{message.replace(/^Your turn: /, "").replace(/^./, (c) => c.toUpperCase())}</p>
      {remarks && (
        <blockquote className="border-l-2 border-slate-200 pl-3 text-xs italic text-slate-500 break-words">&ldquo;{remarks}&rdquo;</blockquote>
      )}
    </div>
  );
}
