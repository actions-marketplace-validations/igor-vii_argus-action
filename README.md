# Argus Action

Runs the **real Argus engine** (delivered as a sealed, signed bundle) against
your SUT in CI: **real protocol sessions, real refusal points**. No mocks, no
stub traffic — the engine drives your system under test over `127.0.0.1`,
records JSONL ledgers and issues registry-verdicts (`PASS` / `FAIL` /
`DOCUMENTED` / `HARNESS_ERROR`).

## What it does, in order

1. Reads `argus.sut.json` (missing or invalid → `action_required` + onboarding
   example in the step summary).
2. Fetches the sealed engine bundle from the console:
   `GET /api/v1/engine/bundle?battery=<id>` → `302` signed URL (TTL 10 min),
   `X-Argus-Engine-Version` header. Bundle caching via `@actions/cache` keyed
   by `argus-engine-<version>`.
3. Verifies the seal **locally**: manifest schema → `key_id` against the lab
   public keys → Ed25519 signature over the canonical manifest →
   `tree_sha256` of the tarball. A broken seal means `action_required` and
   **zero execution**.
4. Extracts the bundle, spawns your SUT, waits for the readiness endpoint,
   then runs the engine: the facilitator counterpart is raised from the
   bundle, real sessions run against your SUT, JSONL ledgers land in the
   workspace, bundle matchers produce verdicts.
5. Validates the engine result client-side (vendored `result-view.mjs`:
   schema, rollup rules, evidence paths, seal invariants).
6. Registers the run with the console (**idempotent debit**: one commit + one
   battery = one charge; job restarts never debit twice). Zero balance →
   `402` + top-up messaging.
7. Renders everything: annotations per session, `GITHUB_STEP_SUMMARY`
   markdown table, `argus-evidence` artifact (`argus-result.json` + ledgers),
   the `argus-battery (<battery>) by Argus Lab` check run, and — opt-in — a
   single PR comment that updates on re-runs.

## Scenario families (lab registry)

| Alias | Family | Argus plays | Your SUT is | Sessions |
| --- | --- | --- | --- | --- |
| s9 | **BC** | bad client / buyer | seller (default) | 9 |
| s8 | **S-BS** | bad service / seller | buyer (`role: "client"`) | 6 |
| s1–s7 | facilitator / orchestrator family | — | — | hosted Block B only |

A correct SUT still shows `DOCUMENTED` on refusal probes — that is by design:
`DOCUMENTED` is evidence, not failure. A resource served despite an invalid
payment is always `FAIL`.

## Usage

```yaml
- uses: argus-lab/argus-action@v2
  with:
    console-url: https://argus-lab.tech
    console-api-key: ${{ secrets.ARGUS_API_KEY }}
    public-run: true        # publish the run report page
    comment: false          # opt-in PR comment
```

### Inputs

| input | default | description |
| --- | --- | --- |
| `console-url` | — (required) | Argus console base URL |
| `console-api-key` | — (required) | Argus API key (one key, one balance) |
| `battery` | from `argus.sut.json` | battery id override |
| `sut-contract-path` | `argus.sut.json` | SUT contract location |
| `bundle-keys-path` | `keys/bundle-keys.json` | lab bundle public keys (sync from the lab repo) |
| `public-run` | `false` | publish the `/runs/<id>` report page |
| `comment` | `false` | post/update a single PR comment with the session table |
| `github-token` | `github.token` | token for the check-run billboard and the comment |

### Outputs

`run-id`, `run-url`, `rollup`, `engine-version`.

## SUT contract (`argus.sut.json`)

```json
{
  "schema": "argus.sut.v0",
  "start": "npm run start:sut",
  "ready": { "url": "http://127.0.0.1:5071/health", "timeout_ms": 30000 },
  "env": { "PORT": "5071", "FACILITATOR_URL": "http://127.0.0.1:5060" },
  "battery": "x402-core"
}
```

v0.1 extensions (backward compatible, optional): `role` (`seller` | `client`),
`payment.rail` (`local`; `base-sepolia` is planned — the engine rejects it in
ci-local runs with a clear HARNESS_ERROR until the on-chain CI wiring lands),
`env.SELLER_URL` (required for `role: "client"`).

## Verdict semantics

| verdict | conclusion | annotation |
| --- | --- | --- |
| `PASS` | success | — |
| `FAIL` | failure | error |
| `DOCUMENTED` | neutral | warning (refusal code) |
| `HARNESS_ERROR` | action_required | error |

`rollup` = max severity. The job exit status approximates the mapping
(failure only on `FAIL`); the authoritative conclusion lives on the Argus
check run.

## Security model

| | seal-key | bundle-key |
| --- | --- | --- |
| signs | verdicts → registry seals | engine bundles |
| storage | offline, maintainer-only | closed-repo Actions secrets |
| mode | manual, one at a time | automatic, every build |
| leak | catastrophic (registry forgery) | rotate, registry unaffected |

The action never sees any private key: it verifies bundles against the lab
public keys (`keys/bundle-keys.json`, synced from the lab repo via PR).
`manifest.key_id` selects the verification key. Seal policy: the registry is
appended only with manually reviewed, offline-signed live runs — CI and
console runs are never sealed automatically; `seal-eligible` marks a
candidate, not a seal.

## Billing

- 3 welcome runs free (CI + console share one balance — one key, one balance).
- $3 per core battery run; $29 per 30-run package (credits do not expire).
- Idempotent debits: one commit + one battery = one charge, restarts are free.
- Zero balance → `402` + explicit top-up messaging; overdraft floor −3 per
  contract. No silent charges: the first paid run shows the price and balance.

## Timeouts (P0-4)

Console/bundle endpoints 30 s and 120 s (`AbortSignal.timeout`); Checks API
and other GitHub calls 10 s.

## Local development

```bash
npm ci
npm run build          # esbuild -> dist/index.js (committed)
npm run typecheck
npm test               # unit (22) + e2e (12 scenarios A–J)
npm run check:language # zero mentions of the retired mode in live paths
```

The e2e suite boots the mock console, builds a genuinely sealed bundle via the
CI packer (Ed25519), generates the tamper matrix and runs the orchestrator
against the lab demo SUT (seller role) and demo buyer (client role).

Contract reference: `docs/result-contract-v0.md` in the lab repo.
