'use client';
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
  return <main className="mx-auto max-w-5xl space-y-6 p-6"><h1 className="text-2xl font-semibold">Staging readiness</h1><p>Run the automated checks before testing company signup, sessions and private files. These checks do not deploy changes or send emails.</p>
    <button onClick={() => void inspect()} disabled={busy || !token} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Checking…' : 'Run readiness checks'}</button>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {report && <><p className="font-semibold">{report.readyForManualTests ? 'Automated prerequisites passed.' : 'Resolve these blockers before the full manual test.'}</p>
      <ul className="list-disc pl-6">{report.blockers.map(item => <li key={item}>{item}</li>)}</ul>
      <h2 className="text-xl font-semibold">Production follow-up</h2><ul className="list-disc pl-6">{report.productionBlockers.map(item => <li key={item}>{item}</li>)}</ul>
      <h2 className="text-xl font-semibold">Manual checks</h2><ul className="list-disc pl-6">{report.manualChecks.map(item => <li key={item}>{item}</li>)}</ul>
      {(['configuration', 'database', 'storage', 'jobs'] as const).map(key => <details key={key} className="rounded border p-4"><summary className="cursor-pointer font-medium">{key}</summary><pre className="mt-3 overflow-auto text-xs">{JSON.stringify(report[key], null, 2)}</pre></details>)}</>}
  </main>;
}
