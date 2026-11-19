// Vendored client-side validator for Argus engine results (argus.result.v0).
// P0-5: the action never trusts engine output without these rollup rules.
// Dependency-free (node builtins only) so it can run inside the action bundle
// and standalone. Canonical copy lives in the lab repo docs; this vendored
// copy is updated via PR only.
import fs from 'node:fs';
import path from 'node:path';

export const VERDICTS = ['PASS', 'FAIL', 'DOCUMENTED', 'HARNESS_ERROR'];
export const SEVERITY = { PASS: 0, DOCUMENTED: 1, FAIL: 2, HARNESS_ERROR: 3 };
export const CONCLUSION_MAP = {
  PASS: 'success',
  FAIL: 'failure',
  DOCUMENTED: 'neutral',
  HARNESS_ERROR: 'action_required',
};
export const REFUSAL_CODES = [
  'nonce_reused',
  'bad_signature',
  'amount_mismatch',
  'settle_failed',
  'verify_unavailable',
  'unknown_resource',
  'malformed',
  'invalid_receipt',
  'amount_exceeds_challenge',
  'malformed_challenge',
  'untrusted_facilitator',
  'unsupported_version',
  'duplicate_offer',
  'unverified_receipt',
  'additional_payment_demand',
];

export function rollupOf(verdicts) {
  return (verdicts || []).reduce(
    (max, v) => (SEVERITY[v?.verdict] > SEVERITY[max] ? v.verdict : max),
    'PASS',
  );
}

export function validateResult(result, opts = {}) {
  const errors = [];
  const cwd = opts.cwd ?? process.cwd();
  const checkFiles = opts.checkFiles ?? true;
  if (!result || typeof result !== 'object') {
    return { ok: false, errors: ['result is not an object'], result };
  }
  if (result.schema !== 'argus.result.v0') {
    errors.push(`schema must be argus.result.v0, got ${String(result.schema)}`);
  }
  if (result.mode !== 'live' && result.mode !== 'ci-local') {
    errors.push(`unknown mode: ${String(result.mode)}`);
  }
  if (!result.battery) errors.push('battery is missing');
  if (!/^\d+\.\d+\.\d+/.test(String(result.engine_version ?? ''))) {
    errors.push('engine_version is missing or not semver');
  }
  if (!Array.isArray(result.verdicts) || result.verdicts.length === 0) {
    if (result.rollup !== 'HARNESS_ERROR') errors.push('verdicts must not be empty unless rollup is HARNESS_ERROR');
  } else {
    for (const v of result.verdicts) {
      if (!v.session_id || !v.name) errors.push('a verdict is missing session_id or name');
      if (!VERDICTS.includes(v.verdict)) errors.push(`session ${v.session_id}: unknown verdict ${String(v.verdict)}`);
      if (v.verdict === 'DOCUMENTED' && (!v.refusal || !REFUSAL_CODES.includes(v.refusal.code))) {
        errors.push(`session ${v.session_id}: DOCUMENTED without a known refusal code`);
      }
      if (v.verdict === 'HARNESS_ERROR' && !v.note) {
        errors.push(`session ${v.session_id}: HARNESS_ERROR without a note`);
      }
    }
    const computed = rollupOf(result.verdicts);
    if (result.rollup !== computed) {
      errors.push(`rollup ${String(result.rollup)} does not match computed ${computed}`);
    }
  }
  if (result.mode === 'ci-local' && opts.requireEvidence !== false && result.rollup !== 'HARNESS_ERROR') {
    if (!Array.isArray(result.ledgers) || result.ledgers.length === 0) {
      errors.push('a ci-local run requires ledger evidence paths');
    }
    for (const v of result.verdicts ?? []) {
      if (!v.evidence) {
        errors.push(`session ${v.session_id}: missing evidence path`);
      } else if (checkFiles && !fs.existsSync(path.resolve(cwd, v.evidence))) {
        errors.push(`session ${v.session_id}: evidence file not found: ${v.evidence}`);
      }
    }
    if (checkFiles) {
      for (const l of result.ledgers ?? []) {
        if (!fs.existsSync(path.resolve(cwd, l))) errors.push(`ledger file not found: ${l}`);
      }
    }
  }
  if (!result.seal || typeof result.seal !== 'object') {
    errors.push('seal block is missing');
  } else if (result.mode === 'ci-local' && result.seal.sealed !== false) {
    errors.push('a ci-local run can never be sealed');
  }
  return { ok: errors.length === 0, errors, result };
}
