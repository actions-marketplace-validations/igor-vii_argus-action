// P1-6: drift vs baseline fixture and flaky detection over verdict history.
// A drift entry is a session whose verdict differs from the baseline run.
// A session is flaky when its verdict changed at least FLAKY_THRESHOLD times
// across the recorded history (adjacent transitions, current run included).
import type { Annotation, SessionVerdict } from './types';

export interface HistoryEntry {
  commit: string;
  verdicts: Record<string, string>;
}

export const HISTORY_LIMIT = 20;
export const FLAKY_THRESHOLD = 3;

export function verdictMapOf(verdicts: SessionVerdict[] | undefined | null): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of verdicts ?? []) if (v?.session_id) map[v.session_id] = v.verdict;
  return map;
}

export interface DriftEntry {
  id: string;
  name: string;
  from: string;
  to: string;
  worse: boolean;
}

const SEVERITY: Record<string, number> = { PASS: 0, DOCUMENTED: 1, UNKNOWN: 1, HOLD: 1, FAIL: 2, HARNESS_ERROR: 2 };

export function deltaOf(current: SessionVerdict[] | undefined | null, baseline: Record<string, string> | null | undefined): { comparable: boolean; drift: DriftEntry[] } {
  const now = verdictMapOf(current);
  if (!baseline || Object.keys(baseline).length === 0) return { comparable: false, drift: [] };
  const drift: DriftEntry[] = [];
  for (const v of current ?? []) {
    const before = baseline[v.session_id];
    if (before && before !== v.verdict) {
      drift.push({
        id: v.session_id,
        name: v.name ?? '',
        from: before,
        to: v.verdict,
        worse: (SEVERITY[v.verdict] ?? 1) > (SEVERITY[before] ?? 1),
      });
    }
  }
  return { comparable: true, drift };
}

export function flakyIdsOf(history: HistoryEntry[], current: SessionVerdict[] | undefined | null): Set<string> {
  const seq: Record<string, string>[] = history.map((h) => h.verdicts).filter(Boolean);
  seq.push(verdictMapOf(current));
  const flaky = new Set<string>();
  const ids = new Set<string>();
  for (const m of seq) for (const id of Object.keys(m)) ids.add(id);
  for (const id of ids) {
    let changes = 0;
    let prev: string | undefined;
    for (const m of seq) {
      const v = m[id];
      if (v === undefined) continue;
      if (prev !== undefined && prev !== v) changes++;
      prev = v;
    }
    if (changes >= FLAKY_THRESHOLD) flaky.add(id);
  }
  return flaky;
}

export function driftAnnotations(drift: DriftEntry[], flaky: Set<string>): Annotation[] {
  const out: Annotation[] = [];
  for (const d of drift) {
    out.push({
      level: d.worse ? 'warning' : 'notice',
      title: `drift: ${d.id}`,
      message: `${d.id} ${d.name}: ${d.from} → ${d.to}${d.worse ? ' (worse)' : ' (improved)'}${flaky.has(d.id) ? ' · flaky' : ''}`,
    });
  }
  for (const id of flaky) {
    if (drift.some((d) => d.id === id)) continue;
    out.push({ level: 'notice', title: `flaky: ${id}`, message: `${id} flapped >= ${FLAKY_THRESHOLD} times across recorded runs` });
  }
  return out;
}

export function driftSummaryLines(comparable: boolean, drift: DriftEntry[], flaky: Set<string>, baselineLabel: string): string[] {
  if (!comparable) return [];
  const lines: string[] = ['', `### Drift vs ${baselineLabel}`, ''];
  if (!drift.length && !flaky.size) {
    lines.push('No verdict changes vs baseline.');
    return lines;
  }
  if (drift.length) {
    lines.push('| Session | Verdict change | Direction |', '| --- | --- | --- |');
    for (const d of drift) {
      lines.push(`| ${d.id} ${d.name} | ${d.from} → ${d.to} | ${d.worse ? 'worse' : 'improved'}${flaky.has(d.id) ? ' · flaky' : ''} |`);
    }
  }
  const rest = [...flaky].filter((id) => !drift.some((d) => d.id === id));
  if (rest.length) lines.push(`Flaky (no change in this run): ${rest.join(', ')}`);
  return lines;
}
