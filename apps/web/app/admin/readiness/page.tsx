"use client";

import { Button } from "@/components/ui/button";

import { PageHeader } from "@/components/patterns/PageHeader";
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';
type Readiness = { readyForManualTests: boolean; blockers: string[]; productionBlockers: string[]; manualChecks: string[]; configuration: Record<string, unknown>; database: unknown; storage: unknown; jobs: unknown };
export default function ReadinessPage() {
  const token = useAuthStore(state => state.accessToken);
  const [report, setReport] = useState<Readiness | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function inspect() {
    if (!token) return;
    setBusy(true); setError('');
    try {
      const res = await apiClient('/api/operations/readiness', {}, token);
      if (!res.ok) throw new Error(res.status === 403 ? 'Platform administrator access is required.' : 'Readiness check failed. Check the API logs using the request ID.');
      setReport(await res.json());
    } catch (error) { setError(error instanceof Error ? error.message : 'Connection failed'); }
    finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Staging readiness"
        description="Run the automated checks before testing company signup, sessions and private files. These checks do not deploy changes or send emails."
        actions={<Button onClick={() => void inspect()} disabled={busy || !token}>{busy ? "Checking…" : "Run readiness checks"}</Button>}
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {report && (
        <section className="space-y-5 rounded-xl border border-border bg-card p-5">
          <p role="status" className="font-semibold">
            {report.readyForManualTests ? "Automated prerequisites passed." : "Resolve these blockers before the full manual test."}
          </p>
          <ul className="list-disc pl-6">{report.blockers.map(item => <li key={item}>{item}</li>)}</ul>
          <div>
            <h2 className="text-lg font-semibold">Production follow-up</h2>
            <ul className="list-disc pl-6">{report.productionBlockers.map(item => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Manual checks</h2>
            <ul className="list-disc pl-6">{report.manualChecks.map(item => <li key={item}>{item}</li>)}</ul>
          </div>
          {(["configuration", "database", "storage", "jobs"] as const).map(key => (
            <details key={key} className="rounded-lg border border-border p-4">
              <summary className="cursor-pointer font-medium capitalize">{key}</summary>
              <pre className="mt-3 overflow-auto text-xs">{JSON.stringify(report[key], null, 2)}</pre>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
