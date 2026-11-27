"use client";
import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BODY,
  active,
  personColour,
  ISSUE,
  branchName,
  human,
  type Index,
  type Person,
} from "./model";
import { Portrait } from "./PersonCard";
import styles from "./chart-v3.module.css";
export type EmploymentDetails = {
  employeeCode?: string | null;
  employmentType?: string | null;
  workStation?: string | null;
  section?: string | null;
  subSection?: string | null;
  shift?: string | null;
  level?: string | null;
  grade?: string | null;
  primaryWorkRole?: string | null;
  jobDescription?: string | null;
};
export type LoadEmployment = (id: string) => Promise<EmploymentDetails>;
function PersonList({
  title,
  ids,
  index,
  onPick,
  colours,
  colourBy,
  includeInactive,
}: {
  title: string;
  includeInactive: boolean;
  ids: string[];
  index: Index;
  onPick: (id: string) => void;
  colours: Map<string, string>;
  colourBy: "department" | "branch";
}) {
  const [all, setAll] = useState(false),
    shown = all ? ids : ids.slice(0, 12);
  return (
    <section className={styles.peopleSection}>
      <h3>
        {title} <span>({ids.length})</span>
      </h3>
      {!ids.length ? (
        <p className={styles.hint}>None recorded.</p>
      ) : (
        <ul className={styles.peopleGrid}>
          {shown.map((id) => {
            const p = index.byId.get(id)!;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onPick(id)}
                  className={styles.miniPerson}
                  style={{
                    borderLeftColor: personColour(p, colours, colourBy),
                  }}
                >
                  <Portrait person={p} />
                  <span>
                    <strong>{p.name}</strong>
                    {p.employeeCode && (
                      <span>Employee code: {p.employeeCode}</span>
                    )}
                    <span>
                      {p.jobTitle || "Job title not recorded"}
                      {!active(p) ? " · Inactive" : ""}
                    </span>
                    <span>
                      Department: {p.department?.name || "Not recorded"}
                    </span>
                    <span>
                      Branch / site: {branchName(p) || "Not recorded"}
                    </span>
                    <span>
                      {
                        (index.children.get(id) || []).filter(
                          (child) =>
                            includeInactive || active(index.byId.get(child)!),
                        ).length
                      }{" "}
                      {includeInactive ? "" : "active "}direct reports
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {ids.length > 12 && (
        <button type="button" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer people" : `Show all ${ids.length} people`}
        </button>
      )}
    </section>
  );
}
export function PersonDetails({
  person,
  index,
  colours,
  identity,
  loadEmployment,
  departmentHref,
  onNavigate,
  onPick,
  onIsolate,
  onBackToChart,
  onClose,
  includeInactive,
  colourBy,
}: {
  person: Person;
  index: Index;
  colours: Map<string, string>;
  identity: string;
  loadEmployment?: LoadEmployment;
  departmentHref?: string;
  onNavigate?: () => void;
  onPick: (id: string) => void;
  onIsolate: () => void;
  onBackToChart: () => void;
  onClose: () => void;
  includeInactive: boolean;
  colourBy: "department" | "branch";
}) {
  const [includeTeams, setIncludeTeams] = useState(false);
  const profile = useQuery({
    queryKey: ["ems-chart-v3-employment", identity, person.id],
    queryFn: () => loadEmployment!(person.id),
    enabled: !!loadEmployment,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const employment = loadEmployment && !profile.isError ? profile.data : undefined;
  const visible = (id: string) =>
    includeInactive || active(index.byId.get(id)!);
  const direct = (index.children.get(person.id) || []).filter(visible),
    above = index.ancestors(person.id),
    peers = index.peers(person.id).filter(visible);
  const manager = index.parent.get(person.id),
    originalManager = person.managerId
      ? index.byId.get(person.managerId)
      : null;
  const issueText = (index.issues.get(person.id) || []).map(
    (i) => ISSUE[i] || i,
  );
  const fields: [string, string | null | undefined][] = [
    ["Employee code", person.employeeCode || employment?.employeeCode],
    [
      "Employment type",
      employment?.employmentType ? human(employment.employmentType) : null,
    ],
    ["Work area", employment?.workStation],
    ["Section", employment?.section],
    ["Subsection", employment?.subSection],
    ["Shift", employment?.shift],
    ["Level", employment?.level],
    ["Grade", employment?.grade],
    ["Primary work role", employment?.primaryWorkRole],
  ];
  return (
    <section
      className={styles.personDetails}
      style={
        {
          "--detail-colour": personColour(person, colours, colourBy),
        } as CSSProperties
      }
      tabIndex={-1}
      aria-label="Selected person and team"
    >
      <div className={styles.sectionHeading}>
        <h2>Person & team</h2>
        <div className={styles.buttonRow}>
          <button type="button" onClick={onBackToChart}>
            Back to chart ↑
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close person and team"
          >
            ×
          </button>
        </div>
      </div>
      <div className={styles.personSummary}>
        <Portrait person={person} />
        <div>
          <h3>{person.name}</h3>
          <p>{person.jobTitle || "Job title not recorded"}</p>
        </div>
        <div className={styles.buttonRow}>
          {loadEmployment && (
            <Link href={`/ems/employees/${encodeURIComponent(person.id)}`}>
              Open profile
            </Link>
          )}
          <button type="button" onClick={onIsolate}>
            Isolate team
          </button>
        </div>
      </div>
      <dl className={styles.detailGrid}>
        <div>
          <dt>Department</dt>
          <dd>
            {person.department && departmentHref ? (
              <Link href={departmentHref} onClick={onNavigate}>
                {person.department.name}
              </Link>
            ) : (
              person.department?.name || "Not recorded"
            )}
          </dd>
        </div>
        <div>
          <dt>Branch / site</dt>
          <dd>{branchName(person) || "Not recorded"}</dd>
        </div>
        <div>
          <dt>Employment status</dt>
          <dd>{person.status ? human(person.status) : "Current employee"}</dd>
        </div>
        <div>
          <dt>Reports to</dt>
          <dd>
            {manager ? (
              <button type="button" onClick={() => onPick(manager)}>
                {index.byId.get(manager)!.name}
              </button>
            ) : originalManager ? (
              `${originalManager.name} · reporting needs review`
            ) : person.reportsToBody ? (
              BODY[person.reportsToBody] || person.reportsToBody
            ) : (
              "No confirmed reporting assignment"
            )}
          </dd>
        </div>
        <div>
          <dt>Team</dt>
          <dd>
            {direct.length} direct reports ·{" "}
            {index.descendants(person.id).filter(visible).length} in their whole
            team{includeInactive ? "" : " · active people"}
          </dd>
        </div>
        {fields
          .filter(([, value]) => !!value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "Not recorded"}</dd>
            </div>
          ))}
      </dl>
      {employment?.jobDescription && (
        <div className={styles.roleDescription}>
          <h3>Role & responsibilities</h3>
          <p>{employment.jobDescription}</p>
        </div>
      )}
      {loadEmployment && profile.isPending && (
        <p role="status" className={styles.hint}>
          Loading employment details…
        </p>
      )}
      {profile.isError && (
        <p role="status" className={styles.notice}>
          Additional employment details could not be loaded.{" "}
          <button type="button" onClick={() => void profile.refetch()}>
            Retry
          </button>{" "}
          You can also open the profile using your usual access.
        </p>
      )}
      {!!issueText.length && (
        <p className={styles.warning}>{issueText.join(" · ")}</p>
      )}
      {above.length > 0 && (
        <nav aria-label="Reporting chain" className={styles.chain}>
          {above.map((id) => (
            <span key={id}>
              <button type="button" onClick={() => onPick(id)}>
                {index.byId.get(id)!.name}
              </button>
              <span aria-hidden="true"> → </span>
            </span>
          ))}
          <strong>{person.name}</strong>
        </nav>
      )}
      <PersonList
        title="Direct reports"
        ids={direct}
        index={index}
        onPick={onPick}
        colours={colours}
        colourBy={colourBy}
        includeInactive={includeInactive}
      />
      {direct.some((id) => (index.children.get(id) || []).some(visible)) && (
        <>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={includeTeams}
              onChange={(e) => setIncludeTeams(e.target.checked)}
            />{" "}
            Include their teams below
          </label>
          {includeTeams &&
            direct
              .filter((id) => (index.children.get(id) || []).some(visible))
              .map((id) => (
                <PersonList
                  key={id}
                  title={`${index.byId.get(id)!.name}’s team`}
                  ids={index.children.get(id)!.filter(visible)}
                  index={index}
                  onPick={onPick}
                  colours={colours}
                  colourBy={colourBy}
                  includeInactive={includeInactive}
                />
              ))}
        </>
      )}
      <details className={styles.peers}>
        <summary>Peers ({peers.length})</summary>
        <p className={styles.hint}>
          People who report to the same person or governing body.
        </p>
        {!peers.length ? (
          <p className={styles.hint}>No peers recorded.</p>
        ) : (
          <ul className={styles.peerList}>
            {peers.map((id) => {
              const p = index.byId.get(id)!;
              return (
                <li key={id}>
                  <button type="button" onClick={() => onPick(id)}>
                    <strong>{p.name}</strong>
                    <span>
                      {p.jobTitle || "Job title not recorded"}
                      {!active(p) ? " · Inactive" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </details>
    </section>
  );
}
