# Argus battery — GitHub Action

**Black-box x402 payment battery for AI agents, right in your CI.** On every
push (or PR, or schedule) this Action submits your commit to the Argus
console, runs the seeded failure battery against the canonical payment
scenarios, and records the verdict as a **check run** on the commit — with
the full machine-readable result pinned as `argus-result.json`.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Test whether AI agents behave correctly when the world goes wrong.**
> Argus is an independent black-box testing laboratory for agentic payment
> rails: duplicate requests, payment-before-execution, crash after
> settlement, concurrent duplicates, retries, lost delivery, budget
> policy probes.

## What it does

1. `POST /api/v1/runs` with your commit SHA (`docs/ci/api-contract-v0.md`).
2. The console debits **1 run** from your account and executes the battery
   with a **commit-derived seed**:
   `sha256("argus.seed.v1:" + commit_sha + ":" + battery.id)`.
3. The full `argus.result.v0` object (`docs/ci/result-contract-v0.md`) is
   written to `argus-result.json` and rendered as a check run:
   `argus-battery (<battery-id>)`.

**Idempotent by design:** re-running the same commit with the same battery
is free — you get the original verdict back (`409` + replay header), so
"rerun until green" is impossible. Variance across commits is intentional:
it measures your agent's drift, not engine noise.

## Quick start

```yaml
name: argus-battery
on: [push]

jobs:
  argus:
    runs-on: ubuntu-latest
    permissions:
      checks: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: igor-vii/argus-action@v1
        with:
          api-key: ${{ secrets.ARGUS_API_KEY }}
```

Store the key once: **console → Billing → CI api-key → Issue → copy**, then
`Settings → Secrets and variables → Actions → New repository secret` → name
it `ARGUS_API_KEY`. Never inline the key.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `api-key` | **yes** | — | Argus console api-key. Pass `${{ secrets.ARGUS_API_KEY }}`, never a literal. |
| `battery-id` | no | `x402-core` | `x402-core` (9 scenarios: duplicate request, payment before execution, crash after settlement, concurrent duplicate, retry, lost delivery, canonical x402 flow, fiat lost response, fiat over-budget), `client-standard` / `client-engine` (canonical S8 + S10/S11). |
| `console-url` | no | `https://console.argus-lab.tech` | Self-hosting the console? Point this at your base URL. |

## Outputs

- **Check run** `argus-battery (<battery-id>)` on the pushed commit — the
  verdict signal lives here, not in the job status.
- **`argus-result.json`** artifact file in the workspace: the complete
  `argus.result.v0` object — per-scenario verdicts, evidence hashes, the
  seed, the rollup.

### Conclusion mapping

| Situation | Check conclusion | Job exit |
| --- | --- | --- |
| All scenarios PASS | `success` | 0 |
| Any scenario FAIL | `failure` | 0 (job green — the signal is the check) |
| UNKNOWN / HOLD present, no FAIL | `neutral` | 0 |
| No balance (`402`) | `action_required` + annotation | 1 |
| Invalid api-key (`401`) | `action_required` + annotation | 1 |
| Rig failure (`5xx`) | `action_required` + annotation | 1 |

A FAIL is a **delivered product**: the battery ran and found something. A
`402`/`401`/`5xx` means your agent was **not measured at all** — that is why
it maps to `action_required`, never to a red agent verdict.

## Billing, in one paragraph

One api-key per account, one shared balance. Each unique
`(commit_sha, battery_id)` pair debits 1 run **before** execution; replays
are free; the quota is refunded automatically if the rig fails (a FAIL
verdict is not a rig failure — the battery ran, the agent lost). The balance
may dip to −3 (advisory overdraft floor) so a zeroed balance never
hard-breaks a live pipeline mid-day; below the floor the Action stops with
`action_required` and a top-up link. Balance and debit history live in the
console Billing tab.

## Simulation honesty (non-negotiable)

> *Simulation replays x402 scenario variants per the protocol spec without
> executing the agent under test. Results may vary across runs for the same
> agent — each run samples the scenario space. Not live traffic; not
> citable as evidence; not an audit or compliance attestation.*

The CI battery is a seeded simulation against mock targets — it never sends
traffic to your endpoint. Run results carry the `SIMULATION` marker in the
console and the `mode: "simulation"` + disclaimer in the result object.
Live-traffic batteries are a lab-assisted service, not a CI feature.

## FAQ

**Why is my job green but the check red?** Exit codes and check conclusions
are different layers by contract. The job stays green for PASS/UNKNOWN so a
neutral observation does not fail your build; the check carries the signal.
Red job = infrastructure problem (key/balance/rig), red check = finding.

**Is the same commit really free to re-run?** Yes — the idempotency key is
derived from the commit and battery; the console returns the stored verdict
with `X-Argus-Replayed: 1`. A different commit is a new, paid, seed-different
run.

**Can I use my own console?** Pass `console-url`. Your console must run the
engine (`ARGUS_ENGINE_DIR`); engine-less hosts answer `503
engine_not_configured` and the Action reports `action_required`.

**Does this replace my functional tests?** No — it attacks the failure
boundaries happy-path tests miss: duplicates, crashes after settlement,
timeouts, ambiguous delivery, budget policy.

## Source of truth & sync

The reference implementation lives in the public lab repo at
[`igor-vii/Argus-Agent-Test-Lab/action`](https://github.com/igor-vii/Argus-Agent-Test-Lab/tree/main/action)
(together with the contract docs and the result validator). This repository
mirrors it for Marketplace discoverability; contract changes ship as
ordinary commits to the lab repo first, then land here in a new release.

## License

[MIT](LICENSE) — © 2026 igor-vii
