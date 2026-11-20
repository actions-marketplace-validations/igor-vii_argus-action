// GitHub Actions implementation of the Ports surface. All GitHub API calls
// honor the P0-4 10 s Checks API timeout.
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as artifact from '@actions/artifact';
import * as cache from '@actions/cache';
import fs from 'node:fs';
import path from 'node:path';
import { TIMEOUTS } from '../lib/console-client';
import type { ActionInputs, Annotation, Ports } from '../lib/types';

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out after ${TIMEOUTS.githubApiMs} ms`)), TIMEOUTS.githubApiMs),
    ),
  ]) as Promise<T>;
}

export function readInputs(): ActionInputs {
  return {
    consoleUrl: core.getInput('console-url', { required: true }),
    consoleApiKey: core.getInput('console-api-key', { required: true }),
    battery: core.getInput('battery') || undefined,
    sutContractPath: core.getInput('sut-contract-path') || 'argus.sut.json',
    // Trust anchor: bundle public keys are pinned IN the action (immutable per
    // action version). A user-repo keys file would let a PR swap the trust
    // root and verify attacker-signed bundles — never ship keys from the repo.
    bundleKeysPath:
      core.getInput('bundle-keys-path') || path.join(__dirname, '..', 'keys', 'bundle-keys.json'),
    publicRun: (core.getInput('public-run') || 'false').toLowerCase() === 'true',
    comment: (core.getInput('comment') || 'false').toLowerCase() === 'true',
    baselineFixture: core.getInput('baseline-fixture') || undefined,
    repo: `${github.context.repo.owner}/${github.context.repo.repo}`,
    commit: github.context.sha,
  };
}

export function buildGithubPorts(inputs: ActionInputs): Ports {
  const token = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';
  const octokit = token ? github.getOctokit(token) : null;
  const prNumber = github.context.payload.pull_request?.number ?? null;

  const checks = octokit
    ? {
        create: async (input: {
          name: string;
          conclusion: string;
          title: string;
          summary: string;
          detailsUrl?: string;
          annotations: Annotation[];
        }) => {
          await withTimeout(
            octokit.rest.checks.create({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              head_sha: github.context.sha,
              name: input.name,
              status: 'completed',
              conclusion: input.conclusion as never,
              details_url: input.detailsUrl,
              output: {
                title: input.title,
                summary: input.summary,
                annotations: input.annotations.map((a) => ({
                  path: inputs.sutContractPath,
                  start_line: 1,
                  end_line: 1,
                  annotation_level: (a.level === 'error' ? 'failure' : a.level) as 'failure' | 'notice' | 'warning',
                  message: a.message.slice(0, 240),
                  title: a.title,
                })),
              },
            }),
            'checks api',
          );
        },
      }
    : null;

  const comments =
    octokit && inputs.comment && prNumber
      ? {
          upsert: async (marker: string, body: string) => {
            const list = await withTimeout(
              octokit.rest.issues.listComments({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                issue_number: prNumber,
                per_page: 100,
              }),
              'comments api',
            );
            const existing = list.data.find((c) => c.body?.includes(marker));
            if (existing) {
              await withTimeout(
                octokit.rest.issues.updateComment({
                  owner: github.context.repo.owner,
                  repo: github.context.repo.repo,
                  comment_id: existing.id,
                  body,
                }),
                'comments api',
              );
            } else {
              await withTimeout(
                octokit.rest.issues.createComment({
                  owner: github.context.repo.owner,
                  repo: github.context.repo.repo,
                  issue_number: prNumber,
                  body,
                }),
                'comments api',
              );
            }
          },
        }
      : null;

  return {
    inputs,
    paths: {
      repoRoot: process.env.GITHUB_WORKSPACE || process.cwd(),
      workspace: path.join(process.env.GITHUB_WORKSPACE || process.cwd(), 'argus-run'),
    },
    log: (msg) => core.info(msg),
    annotate: (a: Annotation) => {
      if (a.level === 'error') core.error(a.message, { title: a.title });
      else if (a.level === 'warning') core.warning(a.message, { title: a.title });
      else core.notice(a.message, { title: a.title });
    },
    summary: {
      add: (markdown) => core.summary.addRaw(markdown + '\n\n'),
      write: async () => {
        await core.summary.write();
      },
    },
    outputs: { set: (name, value) => core.setOutput(name, value) },
    conclusion: async (c) => {
      // v1 contract: the workflow step exits non-zero for everything except
      // PASS/UNKNOWN-equivalent conclusions; the authoritative conclusion
      // lives on the Argus check run.
      if (c === 'failure') core.setFailed('Argus verdict: FAIL');
      else if (c === 'action_required') core.setFailed('Argus: action_required — the agent was not measured (billing/rig/contract); see the Argus check run');
      else core.notice(`Argus conclusion: ${c} (authoritative conclusion lives on the Argus check run)`);
    },
    checks,
    comments,
    artifacts: {
      upload: async (files, rootDirectory) => {
        const existing = files.filter((f) => fs.existsSync(f));
        if (!existing.length) return;
        const client = new artifact.DefaultArtifactClient();
        await client.uploadArtifact('argus-evidence', existing, rootDirectory, { retentionDays: 30 });
      },
    },
    cache: {
      restore: async (key, targetDir) => {
        const hit = await cache.restoreCache([targetDir], key);
        return !!hit;
      },
      save: async (key, targetDir) => {
        await cache.saveCache([targetDir], key);
      },
    },
    history: {
      load: async (key) => {
        const file = path.join(process.env.GITHUB_WORKSPACE || process.cwd(), 'argus-run', 'verdict-history.json');
        const hit = await cache.restoreCache([file], `${key}-primary`, [key]);
        if (!hit) return null;
        try {
          return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch {
          return null;
        }
      },
      save: async (key, value) => {
        const file = path.join(process.env.GITHUB_WORKSPACE || process.cwd(), 'argus-run', 'verdict-history.json');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(value));
        // actions/cache keys are immutable per run: append the run id so every
        // run persists its own history snapshot.
        const runId = github.context.runId ? String(github.context.runId) : String(Date.now());
        await cache.saveCache([file], `${key}-${runId}`);
      },
    },
  };
}
