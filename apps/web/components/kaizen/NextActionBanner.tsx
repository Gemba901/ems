"use client";

import { AlertTriangle, CheckCircle2, Clock, Hand } from "lucide-react";
import { Kaizen } from "@/services/kaizen.service";
import { canActOnVerificationStage, KaizenAccessContext, KaizenGating } from "@/components/kaizen/gating";

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

function getNextAction(kaizen: Kaizen, ctx: KaizenAccessContext, gating: KaizenGating): NextAction {
  const raiser = `${kaizen.employee.firstName} ${kaizen.employee.lastName}`;
  const owner = kaizen.kaizenOwner ? `${kaizen.kaizenOwner.firstName} ${kaizen.kaizenOwner.lastName}` : "the kaizen owner";
  const hod = kaizen.department ? `the ${kaizen.department.name} HOD` : "the HOD";
  const reworkRemarks = kaizen.verifications.find((v) => v.decision === "RETURN")?.remarks;

  switch (kaizen.status) {
    case "DRAFT":
      return ctx.isRaiser
        ? { tone: "action", message: "Your turn: finish the draft, then submit it to your HOD for review." }
        : { tone: "waiting", message: `Draft: ${raiser} is still preparing this kaizen.` };
    case "RETURNED_FOR_REVISION":
      return ctx.isRaiser
        ? { tone: "returned", message: `Returned by ${hod}. Update the draft using their remarks and submit again.`, remarks: kaizen.hodPreReviewRemarks }
        : { tone: "waiting", message: `Returned to ${raiser} for changes.`, remarks: kaizen.hodPreReviewRemarks };
    case "PENDING_HOD_PRE_REVIEW":
      return gating.hodPreReview.editable
        ? { tone: "action", message: "Your turn: review this kaizen before work starts. Approve it, send it back, or move it to an SGA." }
        : { tone: "waiting", message: `Waiting for review by ${hod}.` };
    case "REJECTED":
      return { tone: "returned", message: `Rejected by ${hod}.`, remarks: kaizen.hodPreReviewRemarks };
    case "MOVED_TO_SGA":
      return { tone: "done", message: "Moved to a Small Group Activity (SGA), because it needs a team to solve.", remarks: kaizen.hodPreReviewRemarks };
    case "IN_IMPLEMENTATION":
      return ctx.isKaizenOwner
        ? { tone: "action", message: "Your turn: make the change, add after photos and the result, then submit for verification." }
        : { tone: "waiting", message: `Approved: ${owner} is making the change.` };
    case "RETURNED_FOR_REWORK":
      return ctx.isKaizenOwner
        ? { tone: "returned", message: "Returned for rework. Fix the gaps in the implementation and submit again.", remarks: reworkRemarks }
        : { tone: "waiting", message: `Returned to ${owner} for rework.`, remarks: reworkRemarks };
    case "PENDING_VERIFICATION": {
      const canAct = kaizen.verifications.some((v) => canActOnVerificationStage(kaizen, v.stage, ctx));
      return canAct
        ? { tone: "action", message: "Your turn: check the result and record your verification decision below." }
        : { tone: "waiting", message: "Waiting for verification of the result." };
    }
    case "VERIFIED_CLOSED":
      return { tone: "done", message: "Verified and closed. Well done." };
    default:
      return { tone: "waiting", message: "" };
  }
}

// An information card that sits under the kaizen summary and says who acts next.
export default function NextActionBanner({
  kaizen,
  ctx,
  gating,
  className = "",
}: {
  kaizen: Kaizen;
  ctx: KaizenAccessContext;
  gating: KaizenGating;
  className?: string;
}) {
  const { tone, message, remarks } = getNextAction(kaizen, ctx, gating);
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
