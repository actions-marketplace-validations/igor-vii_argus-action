// Local implementation of the Ports surface for e2e: captures summary,
// annotations, outputs, conclusions, artifacts and comments on disk.
import fs from 'node:fs';
import path from 'node:path';
import type { ActionInputs, Annotation, Ports } from '../../src/lib/types';

export interface LocalCapture {
  summaries: string[];
  annotations: Annotation[];
  outputs: Record<string, string>;
  conclusions: string[];
  artifactDirs: string[];
  comments: { marker: string; body: string }[];
}

export function buildLocalPorts(opts: {
  repoRoot: string;
  workspace: string;
  inputs: Partial<ActionInputs> & Pick<ActionInputs, 'consoleUrl' | 'consoleApiKey'>;
  withComments?: boolean;
}): { ports: Ports; capture: LocalCapture } {
  const capture: LocalCapture = {
    summaries: [],
    annotations: [],
    outputs: {},
    conclusions: [],
    artifactDirs: [],
    comments: [],
  };
  const inputs: ActionInputs = {
    repo: opts.inputs.repo ?? 'acme/widgets',
    commit: opts.inputs.commit ?? '000000000000000000000000000000000000c0ff',
    sutContractPath: 'argus.sut.json',
    bundleKeysPath: 'keys/bundle-keys.json',
    publicRun: false,
    comment: false,
    ...opts.inputs,
  } as ActionInputs;

  const ports: Ports = {
    inputs,
    paths: { repoRoot: opts.repoRoot, workspace: opts.workspace },
    log: () => {},
    annotate: (a) => capture.annotations.push(a),
    summary: {
      add: (markdown) => {
        capture.summaries.push(markdown);
      },
      write: async () => {
        fs.writeFileSync(path.join(opts.workspace, 'step-summary.md'), capture.summaries.join('\n'));
      },
    },
    outputs: {
      set: (name, value) => {
        capture.outputs[name] = value;
      },
    },
    conclusion: async (c) => {
      capture.conclusions.push(c);
    },
    checks: null,
    comments: opts.withComments
      ? {
          upsert: async (marker, body) => {
            const idx = capture.comments.findIndex((c) => c.marker === marker);
            if (idx >= 0) capture.comments[idx] = { marker, body };
            else capture.comments.push({ marker, body });
          },
        }
      : null,
    artifacts: {
      upload: async (files, rootDirectory) => {
        const staging = path.join(opts.workspace, 'artifact-staging');
        fs.mkdirSync(staging, { recursive: true });
        for (const f of files) {
          if (!fs.existsSync(f)) continue;
          const rel = path.relative(rootDirectory, f);
          const dest = path.join(staging, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(f, dest);
        }
        capture.artifactDirs.push(staging);
      },
    },
    cache: null,
    history: null,
  };
  return { ports, capture };
}
