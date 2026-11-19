// P0-5 gate: full client-side validation of engine results through the
// vendored result-view before anything is rendered or registered.
import { validateResult } from '../vendor/result-view.mjs';
import type { ArgusResult } from './types';

export interface GateResult {
  ok: boolean;
  errors: string[];
  result: ArgusResult;
}

export function gateResult(result: ArgusResult, opts: { cwd: string; checkFiles?: boolean }): GateResult {
  const r = validateResult(result as unknown as Record<string, unknown>, {
    cwd: opts.cwd,
    checkFiles: opts.checkFiles ?? true,
    requireEvidence: opts.checkFiles === false ? false : true,
  });
  return { ok: r.ok, errors: r.errors as string[], result: r.result as ArgusResult };
}
