# Findings: GitHub Actions CI/CD Quality Gate

## Repository facts

- Repository remote: `CrystalJohn/Parking_Building_Management_System_PBMS`; default working branch: `main`.
- Root `package.json` uses npm workspaces under `apps/*` and a committed root `package-lock.json` is present.
- There is no `.github` directory or existing GitHub Actions workflow.
- API scripts: `build`, `test`, and `lint`; the current API lint script invokes ESLint with `--fix`.
- Web scripts: `lint` and `build`.
- Mobile script: `typecheck`.
- API, web, and mobile build/typecheck passed in the most recent local verification.

## Test baseline

- API full unit test command: `npm test -- --runInBand` from `apps/api`.
- Result: 14 suites passed, 3 failed, 2 skipped; 205 tests passed and 74 failed.
- Failing setup causes: missing `OcrService` mock in session tests, missing `NotificationsService` mock in reservation tests, and missing `linkEvidenceToCheckout` in a gate OCR mock.
- No `apps/api/test/jest-e2e.json` file exists even though the API package declares `test:e2e`.

## Proposed CI checks

| Job | Command | Required initially |
|---|---|---|
| API validation | `npm run lint:check --workspace=@parking/api`, `npm run build --workspace=@parking/api`, `npm test --workspace=@parking/api -- --runInBand` | Yes, after tests are green |
| Web validation | `npm run lint --workspace=@parking/web`, `npm run build --workspace=@parking/web` | Yes |
| Mobile validation | `npm run typecheck --workspace=@parking/mobile` | Yes |
| Quality Gate | No own test command; depends on all three jobs | Yes, as the single required GitHub check |

## Proposed GitHub ruleset

- Target branch: `main`.
- Require a pull request before merge.
- Require the check named exactly `CI / Quality Gate` to pass.
- Require the branch to be up to date before merge.
- Require at least one approval if the team workflow supports peer review.
- Require resolved conversations.
- Block direct pushes, force pushes, and deletion.
- Do not grant an unrestricted bypass to ordinary contributors; document any administrator bypass.
