"use client";

const guides = {
  company: {
    what: "Turn reviewed SWOT findings into measurable company objectives that departments can contribute to directly.",
    why: "A small, evidence-led plan gives departments a clear contribution to make.",
    who: "Management and the planning coordinator; selected contributors help with SWOT. Employees read approved commitments.",
    prepare:
      "Company direction, relevant business findings, evidence where available, goal owners and the planning period.",
    steps: [
      "Consider all six pillars and record short SWOT findings; empty quadrants are allowed.",
      "Give each finding an integer weightage from 1–10 to assess its importance. Priority follows automatically: Low 1–3, Medium 4–7, High 8–10. Weightage can stay blank in a draft and is required before finalising.",
      "Review findings from highest weightage first and choose an objective, existing action, monitoring or no action for each finding. Finalise the assessment once.",
      "Create a measurable objective with its own result, KPI or measurement, baseline, target, unit, owner and deadline. Select contributing departments and explain why this objective matters and how it can be achieved.",
    ],
    output:
      "One measurable company objective register with reviewed sources and contributing departments.",
    next: "Check and approve the company plan, then open Department & Function Plans.",
  },
  department: {
    what: "Define how a department or function will contribute and what it will measure and do.",
    why: "Department targets describe its own contribution rather than copying the company target.",
    who: "The accountable HOD or function manager and the designated plan approver.",
    prepare:
      "An EMS department, approved company objectives, suitable KPI definitions, accountable people and reporting dates.",
    steps: [
      "Link a department goal directly to an approved company objective, or explain an essential ongoing responsibility.",
      "Set the goal's baseline, target, unit and dates. Assign suitable KPIs with their own owners, schedules, providers, verifiers and period targets.",
      "Add delivery actions and assigned steps, or explain why a separate action is unnecessary.",
    ],
    output:
      "A department plan with measurable commitments and actions that people can reuse without copying.",
    next: "Check and approve the plan; agree team, position and individual contributions against it.",
  },
  personal: {
    what: "Agree realistic team, position or employee contributions. Individuals can link an approved company objective or department goal; teams and positions link their department plan.",
    why: "People see only the measures and delivery work for which they are responsible.",
    who: "Managers and team leaders, with employees proposing and acknowledging their own commitments.",
    prepare:
      "The relevant approved company objective or department goal and EMS team, position or person.",
    steps: [
      "Select an approved parent commitment available to you, or explain an ongoing responsibility.",
      "Assign relevant KPIs, owners and period targets; reuse existing department actions or steps.",
      "Agree the commitment with the manager, approve once and record employee acknowledgement.",
    ],
    output:
      "One agreed contribution plan with traceable department links and preserved approved history.",
    next: "Use Check & Approval. Approved commitments are handed to the execution workspace for results and action updates.",
  },
  approval: {
    what: "Check that the plan can be measured and delivered, then approve the same record once.",
    why: "Incomplete or conflicting commitments are resolved before people begin reporting against them.",
    who: "The plan owner prepares it; one designated authorised reviewer approves or returns it.",
    prepare:
      "Goals, reviewed SWOT sources for company objectives, period targets, measurement settings and delivery responsibilities.",
    steps: [
      "Open a plan and resolve the plain-language readiness messages. Incomplete drafts remain available.",
      "The designated approver can approve directly or review a submitted plan; no additional approval chain is required.",
      "For a later change, provide a reason and effective date. The previous approved version stays available.",
    ],
    output:
      "An approved, locked plan with its source versions, targets, schedules and audit history.",
    next: "Execution records progress and results; verification, reviews and reports reuse the same approved commitments.",
  },
};

export function PlanningGuide({ section }: { section: keyof typeof guides }) {
  const guide = guides[section];
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <summary className="cursor-pointer font-medium text-slate-900">
        How to use this section · Know more
      </summary>
      <div className="mt-4 space-y-3 leading-6 text-slate-500">
        <p>
          <strong className="text-slate-900">What:</strong> {guide.what}
        </p>
        <p>
          <strong className="text-slate-900">Why:</strong> {guide.why}
        </p>
        <p>
          <strong className="text-slate-900">Who:</strong> {guide.who}
        </p>
        <p>
          <strong className="text-slate-900">Prepare:</strong> {guide.prepare}
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>
          <strong className="text-slate-900">Output:</strong> {guide.output}
        </p>
        <p>
          <strong className="text-slate-900">Next:</strong> {guide.next}
        </p>
      </div>
    </details>
  );
}
