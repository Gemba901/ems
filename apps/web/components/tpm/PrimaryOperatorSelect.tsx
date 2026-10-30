"use client";

import { ChevronDown } from "lucide-react";
import { useAssetOperators } from "./useAssetOperators";

export function PrimaryOperatorSelect({
  operatorId,
  operatorName,
  onChange,
}: {
  operatorId: string;
  operatorName: string;
  onChange: (id: string, name: string) => void;
}) {
  const {
    members,
    loading,
    failed,
    enabled,
    canViewMembers,
    orgId,
    user,
    query,
  } = useAssetOperators();
  const legacyName = !operatorId && !!operatorName;
  const missingSelection =
    !!operatorId && !members.some((item) => item.id === operatorId);
  const value = legacyName ? "__saved_name__" : operatorId;
  const unavailable = !enabled || loading || failed;
  let hint = `Members of ${user?.organizationName || "your organization"}.`;
  if (!orgId) hint = "Open an organization workspace to select a member.";
  else if (!canViewMembers)
    hint =
      "Your role cannot view the organization member list. An admin, HR or management member can assign an operator.";
  else if (!enabled) hint = "Sign in to load organization members.";
  else if (loading) hint = "Loading organization members…";
  else if (failed) hint = "Could not load organization members. Try again.";
  else if (!members.length)
    hint =
      "No members found in this organization. Add members in Settings → Members.";
  else if (legacyName)
    hint =
      "This name was entered in the preview. Select an organization member to link the operator.";
  else if (missingSelection)
    hint =
      "The saved operator is no longer in this member list. Select another member or leave unassigned.";

  return (
    <div className="tpm-field">
      <label htmlFor="asset-operatorId">Primary operator</label>
      <div className="tpm-select-wrap">
        <select
          id="asset-operatorId"
          name="operatorId"
          value={value}
          disabled={unavailable}
          aria-describedby="hint-operatorId"
          aria-busy={loading}
          onChange={(event) => {
            const member = members.find(
              (item) => item.id === event.target.value,
            );
            onChange(member?.id ?? "", member?.name ?? "");
          }}
        >
          <option value="">
            {loading ? "Loading members…" : "Unassigned"}
          </option>
          {legacyName && (
            <option value="__saved_name__" disabled>
              {operatorName} (saved preview name)
            </option>
          )}
          {missingSelection && (
            <option value={operatorId} disabled>
              {operatorName || "Saved operator"} (
              {unavailable ? "saved selection" : "unavailable"})
            </option>
          )}
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.label}
            </option>
          ))}
        </select>
        <ChevronDown size={15} />
      </div>
      <p
        className={failed ? "tpm-field-error" : "tpm-field-hint"}
        id="hint-operatorId"
        role="status"
      >
        {hint}
      </p>
      {failed && (
        <button
          type="button"
          className="tpm-text-button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Retrying…" : "Retry loading members"}
        </button>
      )}
    </div>
  );
}
