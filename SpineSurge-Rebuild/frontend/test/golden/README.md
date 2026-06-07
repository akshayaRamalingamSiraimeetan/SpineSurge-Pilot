# Parity / golden harness (Step 7a)

Locks the old repo's validated clinical math as ground truth so the Step 7 port can be proven, not
assumed (`LOGIC_PORT_PLAN`). Runs under its own Vitest config (`vitest.golden.config.ts`) whose `@`
alias points at the **old** renderer (`../../src/renderer`).

```
vectors.ts            input-vector catalog (typical / boundary / degenerate / stress / calibration)
helper.ts             deepCloseTo(tol 1e-9) + NaN/Infinity-safe (de)serialization
oracle.gen.test.ts    runs the catalog through the oracle; writes or asserts fixtures
fixtures/*.golden.json committed ground truth (one file per tool)
```

## Commands (run from `frontend/`)

| | |
|---|---|
| `npm run test:golden` | re-prove the oracle against the committed fixtures (CI parity gate) |
| `npm run golden:gen`  | regenerate fixtures (`UPDATE_GOLDEN=1`) — only when a divergence is **accepted** |

## Locked surface (85 cases, as of 2026-06-03)

Pure functions (no DOM/store): `GeometryUtils.*`, the quick measurement calculators
`calculateCobbAngle`, `calculatePILL`, `calculateSVA`, `calculatePelvicParameters`,
`calculateSpinalCurvature`, `calculateVBM`, **pathology** `calculateStenosisArea`,
`calculateSpondylolisthesis`, and the **deformity** suite `calculatePO`, `calculateTS` (=AVT),
`calculateSSA`, `calculateSPi` (=T1SPi/T9SPi/ODHA), `calculateCBVA`, `calculateRVAD`, `calculateTPA`,
`calculateSPA`. The `draw*` renderers are **not** golden-tested (verified visually via `/verify`).
Still to add: **Step 8 planning geometry** (screw trajectory, pedicle, grading) + DICOM coordinate
transforms.

## Step 7b usage

When a module is ported into `src/lib/...`, add a parity test under `src/` (main Vitest config,
`@` → new `src`) that runs the **same** `catalog` vectors through the **ported** function and asserts
against these fixtures via `deepCloseTo`. Green = `new == old`. Any intentional change → an entry in
[`../divergences.md`](../divergences.md) + a fixture regen in the same PR.
