// Shared contracts. Extends argus.result.v0 without breaking it.
export type Verdict = 'PASS' | 'FAIL' | 'DOCUMENTED' | 'HARNESS_ERROR';
export type Conclusion = 'success' | 'failure' | 'neutral' | 'action_required';

export interface SessionVerdict {
  session_id: string;
  family?: string;
  name: string;
  verdict: Verdict;
  refusal: { code: string } | null;
  note?: string | null;
  duration_ms: number;
  evidence?: string;
}

export interface ArgusResult {
  schema: string;
  mode: string;
  battery: string;
  role?: string;
  payment_rail?: string;
  engine_version: string;
  bundle: { key_id: string; tree_sha256: string };
  started_at: string;
  duration_ms: number;
  rollup: Verdict;
  verdicts: SessionVerdict[];
  ledgers: string[];
  seal: { eligible: boolean; sealed: boolean };
  harness_error?: { message: string };
  run?: { id: string; url: string };
  ci_local_notice?: string;
}

export interface BundleManifest {
  schema: string;
  engine_version: string;
  batteries: string[];
  key_id: string;
  tree_sha256: string;
  created_at: string;
  signature: string;
}

export interface BundleKey {
  key_id: string;
  algorithm: string;
  public_key_b64: string;
  created_at?: string;
  status: string;
}

export interface Annotation {
  level: 'notice' | 'warning' | 'error';
  title: string;
  message: string;
}

export interface ActionInputs {
  consoleUrl: string;
  consoleApiKey: string;
  battery?: string;
  sutContractPath: string;
  bundleKeysPath: string;
  publicRun: boolean;
  comment: boolean;
  baselineFixture?: string;
  repo: string;
  commit: string;
}

export interface CheckRunInput {
  name: string;
  conclusion: Conclusion;
  title: string;
  summary: string;
  detailsUrl?: string;
  annotations: Annotation[];
}

export interface Ports {
  inputs: ActionInputs;
  paths: { repoRoot: string; workspace: string };
  log: (msg: string) => void;
  annotate: (a: Annotation) => void;
  summary: { add: (markdown: string) => void; write: () => Promise<void> };
  outputs: { set: (name: string, value: string) => void };
  conclusion: (c: Conclusion) => Promise<void>;
  checks: null | { create: (input: CheckRunInput) => Promise<void> };
  comments: null | { upsert: (marker: string, body: string) => Promise<void> };
  artifacts: { upload: (files: string[], rootDirectory: string) => Promise<void> };
  cache: null | { restore: (key: string, targetDir: string) => Promise<boolean>; save: (key: string, targetDir: string) => Promise<void> };
  // P1-6: verdict history for drift/flaky, backed by the action cache.
  // Key semantics: load/save append-only JSON of HistoryEntry[]; implementations
  // must derive unique save keys (run id) internally.
  history: null | { load: (key: string) => Promise<unknown | null>; save: (key: string, value: unknown) => Promise<void> };
}

export interface Outcome {
  conclusion: Conclusion;
  rollup?: Verdict;
  runId?: string;
  runUrl?: string;
  engineVersion?: string;
}
