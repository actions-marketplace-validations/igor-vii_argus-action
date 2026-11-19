// Deterministic canonical JSON (sorted keys, no whitespace) — must stay
// byte-identical with the engine protocol.mjs and the CI packer.
export function canonical(obj: unknown): string {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return JSON.stringify(obj) ?? 'null';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const record = obj as Record<string, unknown>;
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(record[k])).join(',') + '}';
}
