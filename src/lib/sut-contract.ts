import fs from 'node:fs';

export interface SutContract {
  schema: 'argus.sut.v0';
  role?: 'seller' | 'client';
  start: string;
  ready: { url: string; timeout_ms: number };
  env?: Record<string, string>;
  battery?: string;
  payment?: { rail?: string };
}

export type ContractResult =
  | { ok: true; contract: SutContract; battery: string; role: 'seller' | 'client'; rail: string }
  | { ok: false; reason: string; missing: boolean };

export function loadSutContract(path: string): ContractResult {
  if (!fs.existsSync(path)) {
    return { ok: false, reason: `no argus.sut.json found at ${path}`, missing: true };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (err) {
    return { ok: false, reason: `argus.sut.json is not valid JSON: ${String(err)}`, missing: false };
  }
  const c = raw as Partial<SutContract>;
  if (c.schema !== 'argus.sut.v0') {
    return { ok: false, reason: `unsupported schema: ${String(c.schema)} (expected argus.sut.v0)`, missing: false };
  }
  if (typeof c.start !== 'string' || !c.start.trim()) {
    return { ok: false, reason: 'field "start" must be a non-empty command', missing: false };
  }
  const ready = c.ready as SutContract['ready'] | undefined;
  if (!ready || typeof ready.url !== 'string' || !/^https?:\/\//.test(ready.url)) {
    return { ok: false, reason: 'field "ready.url" must be an http(s) URL', missing: false };
  }
  const timeout = ready.timeout_ms;
  if (typeof timeout !== 'number' || timeout < 1000 || timeout > 120000) {
    return { ok: false, reason: 'field "ready.timeout_ms" must be between 1000 and 120000', missing: false };
  }
  if (c.env !== undefined && (typeof c.env !== 'object' || c.env === null || Object.values(c.env).some((v) => typeof v !== 'string'))) {
    return { ok: false, reason: 'field "env" must be a string-to-string map', missing: false };
  }
  if (c.role !== undefined && c.role !== 'seller' && c.role !== 'client') {
    return { ok: false, reason: `unsupported role: ${String(c.role)} (expected "seller" or "client")`, missing: false };
  }
  const battery = typeof c.battery === 'string' && c.battery.trim() ? c.battery.trim() : 'x402-core';
  const role = c.role ?? 'seller';
  const rail = c.payment?.rail ?? 'local';
  if (role === 'client' && !c.env?.SELLER_URL) {
    return { ok: false, reason: 'role "client" requires env.SELLER_URL in the contract', missing: false };
  }
  return { ok: true, contract: c as SutContract, battery, role, rail };
}

export const EXAMPLE_SUT = `{
  "schema": "argus.sut.v0",
  "start": "npm run start:sut",
  "ready": { "url": "http://127.0.0.1:5071/health", "timeout_ms": 30000 },
  "env": { "PORT": "5071", "FACILITATOR_URL": "http://127.0.0.1:5070" },
  "battery": "x402-core"
}`;
