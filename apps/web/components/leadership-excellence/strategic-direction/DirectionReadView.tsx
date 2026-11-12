"use client";

import type { CoreValue, PillarWeights, TextField } from "@/services/leadership-excellence/strategic-direction.service";
import { PillarGrid } from "./PillarsSection";
import { EYEBROW } from "./ui";

export type DirectionContent = Record<TextField, string> & {
  values: CoreValue[];
  pillarWeights: PillarWeights;
};

/** Element ids for the employee page, so the sidebar's "On this page" links land on each block. */
export interface ReadAnchors {
  organisation: string;
  vision: string;
  mission: string;
  values: string;
}

const Empty = () => <span className="text-muted-foreground italic">Not yet entered</span>;

function Block({
  id,
  heading,
  text,
  why,
}: {
  id?: string;
  heading: string;
  text: string;
  why?: { label: string; text: string };
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-2">
      <h3 className={EYEBROW}>{heading}</h3>
      <p className="text-base whitespace-pre-line text-foreground">{text.trim() ? text : <Empty />}</p>
      {why && (
        <div className="rounded-lg bg-accent p-3">
          <div className="text-xs font-semibold text-secondary-foreground">{why.label}</div>
          <p className="text-sm whitespace-pre-line">{why.text.trim() ? why.text : <Empty />}</p>
        </div>
      )}
    </section>
  );
}

/** Reading page for the company direction: the approved version, or a draft preview (01.03). */
export function DirectionReadView({
  content,
  eyebrow,
  summary,
  anchors,
  showPillars,
}: {
  content: DirectionContent;
  eyebrow: string;
  summary?: React.ReactNode;
  anchors?: ReadAnchors;
  showPillars?: boolean;
}) {
  const values = content.values.filter((v) => v.name.trim() || v.why.trim());
  return (
    <article className="space-y-6 rounded-xl border border-border bg-card p-5 sm:p-6">
      <header id={anchors?.organisation} className="scroll-mt-24 space-y-1">
        <div className={EYEBROW}>{eyebrow}</div>
        <h2 className="text-xl font-semibold">{content.company.trim() || <Empty />}</h2>
        {content.business.trim() && <p className="text-sm text-muted-foreground">{content.business}</p>}
        {summary && <p className="pt-1 text-xs text-muted-foreground">{summary}</p>}
      </header>
      <Block heading="Purpose: Why we exist" text={content.purpose} />
      <Block
        id={anchors?.vision}
        heading="Vision: Our North Star"
        text={content.vision}
        why={{ label: "Why this vision?", text: content.visionWhy }}
      />
      <Block
        id={anchors?.mission}
        heading="Mission: Our Path"
        text={content.mission}
        why={{ label: "Why this mission?", text: content.missionWhy }}
      />
      <section id={anchors?.values} className="scroll-mt-24 space-y-3">
        <h3 className={EYEBROW}>Core values: How we work</h3>
        {values.length === 0 ? (
          <p className="text-sm text-muted-foreground">No values entered yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {values.map((v) => (
              <li key={v.id} className="rounded-lg border border-border bg-muted p-3">
                <div className="font-semibold text-secondary-foreground">{v.name.trim() || <Empty />}</div>
                <p className="text-sm whitespace-pre-line text-muted-foreground">{v.why}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {showPillars && (
        <section className="space-y-3">
          <h3 className={EYEBROW}>Our six excellence pillars</h3>
          <PillarGrid weights={content.pillarWeights} />
        </section>
      )}
    </article>
  );
}
