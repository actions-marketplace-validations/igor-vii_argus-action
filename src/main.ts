// Argus Action entrypoint.
import * as core from '@actions/core';
import { runArgus } from './lib/orchestrator';
import { buildGithubPorts, readInputs } from './github/ports';

async function run(): Promise<void> {
  try {
    const inputs = readInputs();
    const ports = buildGithubPorts(inputs);
    const outcome = await runArgus(ports);
    core.info(`Argus finished with conclusion: ${outcome.conclusion}`);
  } catch (err) {
    core.setFailed(`Argus action failed: ${String(err)}`);
  }
}

void run();
