"use client";

import { useEffect, useState } from "react";
import { IdentifierStep } from "../../../components/auth/IdentifierStep";
import { SetupStep } from "../../../components/auth/SetupStep";
import { LoginStep } from "../../../components/auth/LoginStep";
import { OrgPickerStep } from "../../../components/auth/OrgPickerStep";

import { CompanyLogin } from "@/components/auth/CompanyLogin";
import {
  OnboardingShell,
  Notice,
} from "@/components/onboarding/OnboardingShell";

export type AuthState = {
  identifier: string;
  identifierType?: "phoneOrEmail" | "employeeCode";
  name?: string;
  orgName?: string;
  logoUrl?: string | null;
  setupToken?: string;
  organizations?: {
    id: string;
    name: string;
    organizationUrl: string | null;
  }[];
  selectionToken?: string;
};

export default function AuthPage() {
  const [step, setStep] = useState<
    "IDENTIFY" | "SETUP" | "LOGIN" | "ORG_SELECT"
  >("IDENTIFY");
  const [data, setData] = useState<AuthState>({ identifier: "" });

  const [workspace, setWorkspace] = useState<{
    kind: string;
    hostname: string;
  } | null>(null);
  const [workspaceError, setWorkspaceError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workspace", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setWorkspace(await response.json());
      })
      .catch(() => {
        if (!controller.signal.aborted) setWorkspaceError(true);
      });
    return () => controller.abort();
  }, []);
  if (!workspace)
    return (
      <OnboardingShell login>
        {workspaceError ? (
          <Notice error>
            Unable to load this workspace. Check the address and reload to try
            again.
          </Notice>
        ) : (
          <p role="status" className="text-slate-500">
            Loading your workspace…
          </p>
        )}
      </OnboardingShell>
    );
  if (workspace.kind === "company")
    return <CompanyLogin hostname={workspace.hostname} />;

  return (
    <OnboardingShell login framed={false}>
      {step === "IDENTIFY" && (
        <IdentifierStep
          onSuccess={(res) => {
            setData(res);
            setStep(res.setupToken ? "SETUP" : "LOGIN");
          }}
        />
      )}
      {step === "SETUP" && (
        <SetupStep data={data} onComplete={() => setStep("LOGIN")} />
      )}
      {step === "LOGIN" && (
        <LoginStep
          data={data}
          onBack={() => setStep("IDENTIFY")}
          onOrgRequired={(orgs, selectionToken) => {
            setData((d) => ({ ...d, organizations: orgs, selectionToken }));
            setStep("ORG_SELECT");
          }}
        />
      )}
      {step === "ORG_SELECT" && (
        <OrgPickerStep data={data} onBack={() => setStep("LOGIN")} />
      )}
    </OnboardingShell>
  );
}
