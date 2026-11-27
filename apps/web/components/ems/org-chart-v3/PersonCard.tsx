"use client";
import { memo, useEffect, useState, type CSSProperties } from "react";
import { TenantImage } from "@/components/files/TenantImage";
import {
  BODY,
  ISSUE,
  active,
  branchName,
  cardMode,
  initials,
  type Person,
} from "./model";
import styles from "./chart-v3.module.css";
import { Button } from "@/components/ui/button";
export function Portrait({ person }: { person: Person }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person.photoUrl]);
  return (
    <span className={styles.portrait} aria-hidden="true">
      {initials(person.name)}
      {person.photoUrl && !failed && (
        <TenantImage
          src={person.photoUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
export const PersonCard = memo(function PersonCard({
  person,
  colour,
  zoom = 1,
  compact = false,
  selected = false,
  context = false,
  issues = [],
  kids = 0,
  open = false,
  onPick,
  onToggle,
}: {
  person: Person;
  colour: string;
  zoom?: number;
  compact?: boolean;
  selected?: boolean;
  context?: boolean;
  issues?: string[];
  kids?: number;
  open?: boolean;
  onPick: () => void;
  onToggle?: () => void;
}) {
  const mode = compact ? "name" : cardMode(zoom);
  const style = {
    "--person-colour": colour,
    "--detail-size": `${Math.max(13, Math.min(21, 10.5 / zoom))}px`,
    "--title-size": `${compact && zoom < 0.4 ? Math.max(16, Math.min(35, 11.5 / zoom)) : Math.max(16, Math.min(32, 13 / zoom))}px`,
  } as CSSProperties;
  return (
    <div className={styles.cardShell} style={style}>
      <Button variant="ghost"
        type="button"
        className={`${styles.personCard} h-auto whitespace-normal`}
        data-mode={mode}
        data-compact={compact}
        data-selected={selected}
        data-context={context}
        aria-label={`Details for ${person.name}, ${person.jobTitle || "job title not recorded"}${!active(person) ? ", Inactive" : ""}${context ? ", Reporting context" : ""}`}
        aria-pressed={selected}
        title={[
          person.name,
          person.jobTitle,
          person.department?.name,
          branchName(person),
          !active(person) ? "Inactive" : "",
          context ? "Reporting context" : "",
          ...issues.map((issue) => ISSUE[issue] || issue),
        ]
          .filter(Boolean)
          .join(" · ")}
        onClick={onPick}
      >
        {mode === "block" ? (
          selected ? (
            <span aria-hidden="true" className={styles.tileMark}>
              ●
            </span>
          ) : null
        ) : (
          <>
            <span className={styles.personHeading}>
              {mode === "full" && <Portrait person={person} />}
              <strong>{person.name}</strong>
            </span>
            {(!compact || zoom >= 0.72) && (
              <span className={styles.personRole}>
                {person.jobTitle || "Job title not recorded"}
              </span>
            )}
            {mode === "full" && (
              <>
                <span className={styles.personDept}>
                  {person.department?.name || "Department not recorded"}
                </span>
                <span className={styles.cardNote}>
                  {issues.length
                    ? "⚠ Reporting needs review"
                    : !active(person)
                      ? "Inactive"
                      : context
                        ? "Reporting context"
                        : !person.managerId && person.reportsToBody
                          ? `Reports to ${BODY[person.reportsToBody] || person.reportsToBody}`
                          : branchName(person)}
                </span>
              </>
            )}
          </>
        )}
      </Button>
      {kids > 0 && onToggle && zoom >= 0.22 && (
        <Button variant="ghost"
          type="button"
          className={`${styles.teamToggle} h-auto whitespace-normal`}
          aria-expanded={open}
          aria-label={`${open ? "Close" : "Open"} ${person.name}’s ${kids} direct reports`}
          onClick={onToggle}
          style={{ fontSize: `${Math.min(32, 11 / zoom)}px` }}
        >
          {open ? "−" : "+"} {kids}
        </Button>
      )}
    </div>
  );
});
