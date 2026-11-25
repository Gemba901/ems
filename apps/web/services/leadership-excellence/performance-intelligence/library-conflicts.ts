import type { LibraryCommand, LibraryEntry, LibraryView } from "./library";

export type LibraryOperation = LibraryCommand["action"] | "ADAPT";
type LibraryIdentity = {
  organizationId: string | null;
  userId: string;
  roleLevel: string;
  roleId: number;
};

export function sameLibraryIdentity(
  expected: LibraryIdentity | null,
  current: LibraryIdentity | null,
): boolean {
  return (
    !!expected &&
    !!current &&
    expected.organizationId === current.organizationId &&
    expected.userId === current.userId &&
    expected.roleLevel === current.roleLevel &&
    expected.roleId === current.roleId
  );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function content(entry: LibraryEntry): string {
  return canonical({
    definition: entry.definition,
    status: entry.status,
    approverId: entry.approverId,
    effectiveDate: entry.effectiveDate || "",
    revisionReason: entry.revisionReason,
    approvedVersion: entry.approvedVersion,
    activeVersion: entry.activeVersion,
    versions: entry.versions,
  });
}

/** A newer workspace revision is safe to adopt only after checking this operation's current target. */
export function reviewLibraryRefresh(
  original: LibraryEntry | undefined,
  latest: LibraryView,
  operation: LibraryOperation,
) {
  const entry = original
    ? latest.entries.find(
        (item) => item.definition.id === original.definition.id,
      )
    : undefined;
  const permission = {
    SAVE_DRAFT: "canEdit",
    ADAPT: "canAdapt",
    SUBMIT: "canSubmit",
    APPROVE: "canApprove",
    RETURN: "canReturn",
    REVISE: "canRevise",
  } as const;
  const allowed =
    latest.canEdit &&
    (original
      ? !!entry?.permissions[permission[operation]]
      : operation === "SAVE_DRAFT");
  const changed = !!original && !!entry && content(original) !== content(entry);
  return {
    entry,
    allowed,
    changed,
    requiresConfirmation: allowed && (changed || operation === "APPROVE"),
    message:
      !original || entry
        ? allowed
          ? "Latest library loaded. Your entered values have been kept."
          : "This action is no longer permitted for the current definition. Your entered values have been kept for reference."
        : "This definition is no longer available. Your entered values have been kept for reference.",
  };
}
