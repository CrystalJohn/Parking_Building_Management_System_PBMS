# Task Plan: GitHub Actions CI/CD Quality Gate

## Goal

Create a GitHub Actions quality-gate design that validates API, web, and mobile changes on every pull request to `main`, and configure GitHub branch protection so a pull request cannot merge while any required check is failing.

## Current Phase

Phase 2 - CI/CD plan finalized; implementation intentionally not started.

## Phases

### Phase 1: Repository and test-baseline discovery

- [x] Confirm package manager/workspace structure and available scripts.
- [x] Confirm no existing `.github/workflows` directory.
- [x] Verify API, web, and mobile build/typecheck commands.
- [x] Record current API test status and E2E-test gap.
- **Status:** complete

### Phase 2: CI design

- [x] Define jobs, Node version, cache, trigger events, and stable required check name.
- [x] Define GitHub branch-protection/ruleset settings for `main`.
- [x] Define the rollout order so current red API tests do not silently become an ignored gate.
- **Status:** complete

### Phase 3: Test-suite stabilization

- [ ] Repair unit-test mocks for `OcrService`, `NotificationsService`, and `linkEvidenceToCheckout`.
- [ ] Make `npm test --workspace=@parking/api -- --runInBand` fully green locally.
- [ ] Add a non-mutating API lint check; current `lint` script uses `--fix` and is unsuitable for CI validation.
- **Status:** pending

### Phase 4: Workflow implementation

- [ ] Add `.github/workflows/ci.yml`.
- [ ] Add root-level CI convenience scripts if they improve local/CI parity.
- [ ] Configure API, web, mobile, and aggregate quality-gate jobs.
- [ ] Validate the workflow from a feature branch/PR.
- **Status:** pending

### Phase 5: GitHub merge enforcement

- [ ] Create a branch ruleset or branch-protection rule for `main`.
- [ ] Require the stable `CI / Quality Gate` check and current branch before merge.
- [ ] Prevent direct pushes, force pushes, and branch deletion; decide who may bypass rules.
- [ ] Verify that a deliberately failing PR cannot merge and a passing PR can merge.
- **Status:** pending

### Phase 6: Expand confidence gates

- [ ] Add real-database integration tests for transaction/constraint behavior.
- [ ] Add E2E coverage for the QR reservation and gate checkout happy paths.
- [ ] Add dependency/security scanning and optionally deployment after CI is stable.
- **Status:** pending

## Key Questions

1. Which checks must be hard blockers at first? API unit test, API build, web lint/build, and mobile typecheck are the initial minimum.
2. Is a deployment environment available? No deployment target is presently known, so this plan treats CI and merge protection as the first delivery stage.
3. Can GitHub branch protection be inspected automatically? No: GitHub CLI is not installed in the local environment, so ruleset configuration must be verified in the repository Settings UI or through an authenticated GitHub integration.

## Decisions Made

| Decision | Rationale |
|---|---|
| Use GitHub Actions on `pull_request` and `push` to `main` | PR runs decide merge eligibility; a post-merge `push` run remains a safety record. |
| Use Node.js 20 and `npm ci` from repository root | The repository has a committed root `package-lock.json` and npm workspaces. Node 20 is a stable LTS baseline compatible with the current toolchain. |
| Split API, web, and mobile into independent jobs | A failure shows its owning application immediately and allows unrelated jobs to run in parallel. |
| Publish one final job named `Quality Gate` | GitHub branch protection can require one stable check instead of a fragile list of job names. The job depends on all quality jobs. |
| Do not run the advertised API E2E script initially | `apps/api/test/jest-e2e.json` is absent, so invoking it would create a permanent false failure. Add it after a real test environment is provisioned. |
| Fix red unit tests before enforcing required status checks | A merge gate is only useful when it represents trustworthy behavior; current failures are known stale test mocks. |
| Do not run API `lint` as-is in CI | It includes `--fix`, which modifies files. CI checks must be read-only; add `lint:check`. |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| GitHub skill path advertised by the environment did not exist locally. | 1 | Used local repository inspection and documented branch-rule configuration as a GitHub UI step. |
| `gh` GitHub CLI is not installed. | 1 | Could not inspect or configure current branch protection automatically; no configuration was changed. |
| API E2E script refers to a missing `apps/api/test/jest-e2e.json`. | 1 | Exclude it from initial required CI gate; add real E2E infrastructure in a later phase. |

## Notes

- This plan does not modify source code, GitHub Actions files, repository settings, or branch protection.
- Existing API test baseline on 12 July 2026: 205 passing, 74 failing, 2 skipped. The test command currently exits non-zero.
