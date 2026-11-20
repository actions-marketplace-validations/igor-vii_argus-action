import type { ArgusResult, Conclusion, Ports, SessionVerdict, Verdict } from './types';
import { createHash } from 'node:crypto';
import { CONCLUSION_MAP } from '../vendor/result-view.mjs';

export function conclusionFor(rollup: Verdict): Conclusion {
  return (CONCLUSION_MAP as Record<string, Conclusion>)[rollup] ?? 'action_required';
}

export function sessionAnnotations(sessions: SessionVerdict[], runUrl?: string) {
  const out: { level: 'notice' | 'warning' | 'error'; title: string; message: string }[] = [];
  for (const s of sessions) {
    if (s.verdict === 'FAIL') {
      out.push({
        level: 'error',
        title: `${s.session_id} ${s.name}`,
        message: `FAIL${s.note ? `: ${s.note}` : ''}${runUrl ? ` · Run: ${runUrl}` : ''}`,
      });
    } else if (s.verdict === 'DOCUMENTED') {
      out.push({
        level: 'warning',
        title: `${s.session_id} ${s.name}`,
        message: `DOCUMENTED refusal (${s.refusal?.code ?? 'unknown'})${runUrl ? ` · Run: ${runUrl}` : ''}`,
      });
    } else if (s.verdict === 'HARNESS_ERROR') {
      out.push({
        level: 'error',
        title: `${s.session_id} ${s.name}`,
        message: `HARNESS_ERROR${s.note ? `: ${s.note}` : ''}${runUrl ? ` · Run: ${runUrl}` : ''}`,
      });
    }
  }
  return out;
}

export function checkRunName(battery: string): string {
  return `argus-battery (${battery}) by Argus Lab`;
}

export function idempotencyKeyFor(inputs: Ports['inputs']): string {
  // Contract formula (api-contract-v0): one commit + one battery is one paid run.
  // The repo is implied by the key/account scope, so it is not part of the hash.
  return createHash('sha256').update(`argus.idem.v1:${inputs.commit}:${inputs.battery ?? ''}`).digest('hex');
}

export function evidenceFiles(result: ArgusResult): string[] {
  const paths = new Set<string>();
  for (const v of result.verdicts ?? []) if (v.evidence) paths.add(v.evidence);
  for (const l of result.ledgers ?? []) paths.add(l);
  return [...paths];
}
