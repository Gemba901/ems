"use client";

import { CHECKSHEET_LABEL, PRACTICE_AIMS, PRACTICE_LABELS, PRACTICE_ORDER, PRODUCTION_SHOPFLOOR_CHECKPOINTS } from "@/lib/five-s/template";
import { COUNTING_RULES, SELECTION_RULES, formatLevel, levelFromTotal } from "@/lib/five-s/scoring";
import { RED_TAG_DECISION_LABELS, RED_TAG_REASON_LABELS, type RedTagDecision, type RedTagReason } from "@/services/five-s.service";
import { PageHeader, Surface } from "@/components/five-s/ui";

// Totals shown in the worked examples table: [from, to].
const EXAMPLE_BANDS: [number, number][] = [
  [0, 0],
  [1, 4],
  [5, 8],
  [17, 20],
  [21, 24],
  [97, 100],
];

const SECTIONS = [
  { id: "journey", title: "Audit journey" },
  { id: "practices", title: "The five practices" },
  { id: "checkpoints", title: "Checkpoints" },
  { id: "counting", title: "Counting problem locations" },
  { id: "scoring", title: "Points and level" },
  { id: "actions", title: "Improvement actions" },
  { id: "red-tags", title: "Red tags" },
  { id: "standards", title: "Standards and routines" },
  { id: "roles", title: "Who does what" },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Surface className="scroll-mt-24 p-5" >
      <section id={id} aria-labelledby={`${id}-h`} className="space-y-3 text-sm leading-6 text-slate-700">
        <h2 id={`${id}-h`} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        {children}
      </section>
    </Surface>
  );
}

export default function FiveSGuidePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="How to use 5S"
        description="Key 1 of the 20 Keys system: Cleaning and Organising to Make Work Easy. This guide explains the audit, the scoring and the follow-up."
      />

      <nav aria-label="Guide sections" className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700">
            {s.title}
          </a>
        ))}
      </nav>

      <Section id="journey" title="Audit journey">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Select the workplace area to audit.</li>
          <li>Confirm the audit date and auditor.</li>
          <li>Walk the area with the auditee.</li>
          <li>Record the number of problem locations for all 20 checkpoints.</li>
          <li>Add remarks and photos where useful (optional).</li>
          <li>Review the subtotals for each S, the total points and the level.</li>
          <li>Submit. The audit and its result are then locked.</li>
          <li>Follow up the improvement actions raised from the audit.</li>
        </ol>
        <p>
          You can save an audit as a draft and resume it later. Drafts are shown with a dashed amber border and have no result until they are submitted. Every
          checkpoint must be answered before you can submit.
        </p>
      </Section>

      <Section id="practices" title="The five practices">
        <dl className="grid gap-3 sm:grid-cols-2">
          {PRACTICE_ORDER.map((p) => (
            <div key={p} className="rounded-lg border border-slate-200 p-3">
              <dt className="font-semibold text-slate-900">{PRACTICE_LABELS[p]}</dt>
              <dd>{PRACTICE_AIMS[p]}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="checkpoints" title="Checkpoints">
        <p>
          Audits use the <strong>{CHECKSHEET_LABEL}</strong>: 20 checkpoints, four under each S.
        </p>
        {PRACTICE_ORDER.map((p) => (
          <div key={p}>
            <h3 className="mt-2 font-semibold text-slate-900">{PRACTICE_LABELS[p]}</h3>
            <ol className="space-y-1">
              {PRODUCTION_SHOPFLOOR_CHECKPOINTS.filter((c) => c.practice === p).map((c) => (
                <li key={c.no} className="flex gap-2">
                  <span className="w-6 shrink-0 font-semibold tabular-nums text-slate-500">{c.no}.</span>
                  <span>{c.text}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">The Model Office assessment is not part of this module.</p>
      </Section>

      <Section id="counting" title="Counting problem locations">
        <ul className="list-disc space-y-1 pl-5">
          {COUNTING_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <ul className="list-disc space-y-1 pl-5">
          {SELECTION_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Section>

      <Section id="scoring" title="Points and level">
        <ul className="list-disc space-y-1 pl-5">
          <li>Each checkpoint scores the number of problem locations: 0, 1, 2, 3, 4 or 5 (for 5+).</li>
          <li>Each S has four checkpoints, so it scores 0 to 20 points.</li>
          <li>The total across all five S is 0 to 100 points. Fewer points is better.</li>
        </ul>
        <p className="rounded-lg bg-blue-50 px-3 py-2 font-mono text-sm text-blue-900">Level = ROUND(3.5 − ROUNDUP(total points ÷ 4) × 0.1, 1)</p>
        <p>
          Every 4 points, or part of 4, takes 0.1 off the top level of 3.5. Levels run from 3.5 (no problem locations) down to 1.0 (100 points). The level is
          compared with the area&apos;s target level, which is set between 1.0 and 3.5. Levels are never shown as percentages.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Total points</th>
                <th className="py-2 pr-4 font-medium">ROUNDUP(total ÷ 4)</th>
                <th className="py-2 font-medium">Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {EXAMPLE_BANDS.map(([from, to]) => {
                const r = levelFromTotal(to);
                return (
                  <tr key={from}>
                    <td className="py-2 pr-4 tabular-nums">{from === to ? from : `${from}–${to}`}</td>
                    <td className="py-2 pr-4 tabular-nums">{r.deductionSteps}</td>
                    <td className="py-2 font-semibold tabular-nums">{formatLevel(r.level)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="actions" title="Improvement actions">
        <p>Submitting an audit creates one action for every checkpoint with one or more problem locations. Actions can also be added by hand.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>Open</strong>: the action owner plans the corrective action and due date, then carries it out.
          </li>
          <li>
            <strong>Awaiting verification</strong>: the owner describes what was done, with evidence if available, and submits it.
          </li>
          <li>
            <strong>Verified</strong>: a verifier checks the work in the area. You cannot verify an action you own.
          </li>
        </ol>
        <p>If the work is not good enough, the verifier sends it back for rework with a reason. It returns to Open, and the history records every step.</p>
        <p>
          An action with no due date shows &quot;Due date not set&quot; and is never counted as overdue. Closing actions does not change the score of the audit
          that raised them. The next audit shows the improvement.
        </p>
      </Section>

      <Section id="red-tags" title="Red tags">
        <p>Tag an item that may not be needed in the area. Reasons:</p>
        <ul className="flex flex-wrap gap-2">
          {(Object.keys(RED_TAG_REASON_LABELS) as RedTagReason[]).map((r) => (
            <li key={r} className="rounded-full bg-red-50 px-3 py-0.5 text-xs font-medium text-red-800">
              {RED_TAG_REASON_LABELS[r]}
            </li>
          ))}
        </ul>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Raise the tag with the item, location, quantity, reason and photos.</li>
          <li>
            The tag owner reviews it and records a decision:{" "}
            {(Object.keys(RED_TAG_DECISION_LABELS) as RedTagDecision[]).map((d) => RED_TAG_DECISION_LABELS[d]).join(", ")}.
          </li>
          <li>Carry out the decision and record the final disposition. Only then is the tag resolved.</li>
        </ol>
        <p>
          A tag stays pending until both the decision and the disposition are recorded. Disposal must follow the company approval process: record the approval
          reference. Asset records are never deleted from this register.
        </p>
      </Section>

      <Section id="standards" title="Standards and routines">
        <p>
          A <strong>standard</strong> records the agreed arrangement for an area. A standard is drafted, then approved by the area HOD or a 5S administrator.
          To change an approved standard, start a new revision. When the new revision is approved, it becomes the current standard and the old one is kept as
          superseded. The current approved revision has a green border and the label &quot;Approved (current)&quot;.
        </p>
        <p>
          A <strong>routine</strong> is a regular check. It says what is checked, where, who does it and how often (daily, weekly or monthly). Each scheduled
          check is recorded as done, done with an exception, or not done. A check that is not recorded shows as missed. History is kept when a routine is
          changed or deactivated. Routines do not change audit scores or create actions.
        </p>
      </Section>

      <Section id="roles" title="Who does what">
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ["5S administrator", "Sets up areas, assigns 5S responsibilities, loads or removes sample data and can see the change log."],
            ["Auditor", "Carries out audits and submits them."],
            ["Area owner", "Keeps the area to its standard. Owns audit actions and red tags in the area by default."],
            ["Action owner", "Plans and completes improvement actions, then submits them for verification."],
            ["Verifier", "Verifies completed actions or returns them for rework, and reviews red tags."],
            ["Management viewer", "Sees results and progress across the company without changing records."],
          ].map(([role, text]) => (
            <div key={role} className="rounded-lg border border-slate-200 p-3">
              <dt className="font-semibold text-slate-900">{role}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <p>
          Records marked <span className="rounded-full border border-fuchsia-300 bg-fuchsia-50 px-2 text-xs font-medium text-fuchsia-800">Sample data</span> are
          for training only and can be removed by a 5S administrator.
        </p>
      </Section>
    </div>
  );
}
