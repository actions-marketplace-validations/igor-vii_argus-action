import type { SessionVerdict } from './types';

export interface SummaryInput {
  battery: string;
  role?: string;
  rollup: string;
  engineVersion: string;
  keyId: string;
  runUrl?: string;
  sessions: SessionVerdict[];
  durationMs?: number;
}

const CI_LOCAL_NOTICE = 'ci-local run — evidence: ledgers attached; not a registry seal';
const SEAL_POLICY = 'Seal-eligible: candidate — manual offline review; CI runs are never auto-sealed';
const FOOTER = 'Argus Lab — [argus-lab.tech](https://argus-lab.tech)';

export function renderSummary(o: SummaryInput): string {
  const lines: string[] = [];
  lines.push(`## Argus — battery \`${o.battery}\` → **${o.rollup}**`);
  lines.push('');
  if (o.runUrl) lines.push(`Run report: ${o.runUrl}`);
  lines.push(`Engine: v${o.engineVersion} · bundle key \`${o.keyId}\` · seal verified before execution`);
  lines.push('');
  lines.push('| Session | Family | Verdict | Duration | Refusal |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const s of o.sessions) {
    lines.push(
      `| ${s.session_id} ${s.name} | ${s.family ?? ''} | ${s.verdict} | ${s.duration_ms} ms | ${s.refusal?.code ?? ''} |`,
    );
  }
  lines.push('');
  lines.push(CI_LOCAL_NOTICE);
  lines.push('');
  lines.push(SEAL_POLICY);
  if (o.durationMs !== undefined) lines.push('');
  if (o.durationMs !== undefined) lines.push(`Total: ${o.durationMs} ms`);
  lines.push('');
  lines.push(FOOTER);
  return lines.join('\n');
}

export const COMMENT_MARKER = '<!-- argus-run-comment:v1 -->';

export function renderComment(o: SummaryInput): string {
  const body: string[] = [];
  body.push(COMMENT_MARKER);
  body.push(`## Argus run — battery \`${o.battery}\` → **${o.rollup}**`);
  body.push('');
  if (o.runUrl) body.push(`[Full run report](${o.runUrl})`);
  body.push('');
  body.push('| Session | Verdict | Refusal |');
  body.push('| --- | --- | --- |');
  for (const s of o.sessions) {
    body.push(`| ${s.session_id} ${s.name} | ${s.verdict} | ${s.refusal?.code ?? ''} |`);
  }
  body.push('');
  body.push(CI_LOCAL_NOTICE);
  body.push('');
  body.push(FOOTER);
  return body.join('\n');
}

export function renderBillingSummary(body: Record<string, unknown>): string {
  const topup = String(body.topup_url ?? '/topup');
  return [
    `## Argus — insufficient credits`,
    '',
    `The engine did run and the evidence was collected, but the run could not be registered.`,
    `Balance: \`${String(body.balance)}\` · overdraft floor: \`${String(body.overdraft_floor)}\``,
    `Top up at \`${topup}\` — one credit is one core battery run; pricing: 3 welcome runs free, $3 per run, $29 per 30.`,
    '',
    FOOTER,
  ].join('\n');
}

export function renderOnboardingSummary(reason: string, exampleJson: string, docsUrl: string): string {
  return [
    `## Argus — onboarding required`,
    '',
    `The action did not execute the engine: ${reason}`,
    '',
    'Add `argus.sut.json` to the repository root describing how to start your SUT:',
    '',
    '```json',
    exampleJson,
    '```',
    '',
    `Contract reference: ${docsUrl}`,
    '',
    FOOTER,
  ].join('\n');
}

export function renderSealFailureSummary(reason: string): string {
  return [
    `## Argus — bundle seal verification failed`,
    '',
    `Reason: \`${reason}\`.`,
    '',
    'The engine was **not executed**. This is expected behavior for a tampered or stale bundle;',
    're-run after the bundle is re-published. If this persists, contact Argus Lab.',
    '',
    FOOTER,
  ].join('\n');
}
