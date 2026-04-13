# CyberPay Payroll

[![CI](https://github.com/CyberpayOrg/payroll/actions/workflows/ci.yml/badge.svg)](https://github.com/CyberpayOrg/payroll/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/CyberpayOrg/payroll)](https://github.com/CyberpayOrg/payroll/releases)

CyberPay Payroll is a confidential payroll and treasury stipend demo tailored for the **OpenBuild x Zama bounty**.

It focuses on a practical and compliance-friendly scenario:
- Employees keep salary data private onchain.
- Finance admins can execute monthly payroll cycles.
- Treasury can audit encrypted aggregate budget states.

## Why this project is bounty-focused

This repository intentionally optimizes for judging criteria:
- **Real-world value**: payroll and stipend workflows are practical.
- **Compliance awareness**: supports role-based visibility and audit-ready aggregation.
- **Technical implementation**: uses Zama FHE encrypted integer types (`euint64`) in contract state and arithmetic.
- **Usability**: includes frontend demo, deployment script, and submission template docs.

## Repository structure

- `contracts/CyberPayPayroll.sol`: confidential payroll contract using Zama FHE types.
- `scripts/deploy.ts`: deployment helper.
- `scripts/seedDemo.ts`: local demo data seeding helper.
- `frontend/`: lightweight web demo UI for wallet connection and key flows.

## Complete product loop (local demo)

### 1) Install dependencies

```bash
npm install
```

### 2) Compile contract

```bash
npm run compile
```

### 3) Start local chain (Terminal A)

```bash
npm run node
```

### 4) Deploy contract to local chain (Terminal B)

```bash
npm run deploy:local
```

This writes `frontend/deployment.json` automatically.

### 5) Seed data: configure employees + run first payroll cycle (Terminal B)

```bash
CONTRACT_ADDRESS=<your_deployed_address> npm run seed:local
```

### 6) Run frontend (Terminal C)

```bash
npm run frontend:serve
```

Open [http://localhost:4173](http://localhost:4173), paste deployed contract address, then:
1. Connect wallet (MetaMask -> Localhost 8545).
2. Load contract.
3. Admin configures employee stipend (plain demo input).
4. Admin runs payroll cycle.
5. Employee claims stipend.
6. Treasury dashboard shows allocated/claimed totals and employee mirrors.

## Contract modes

- **demoMode = true** (default deploy script): supports plain-value endpoints for reliable live demo:
  - `configureEmployeePlain`
  - `claimPlain`
- Production encrypted endpoints remain available:
  - `configureEmployee(externalEuint64, proof)`
  - `claim(externalEuint64, proof)`

## Product flow (MVP)

1. Admin configures employee stipend.
2. Admin runs payroll cycle for a list of workers.
3. Each worker claims partial or full accrued stipend.
4. Treasury tracks total allocation and total claimed.
5. Dashboard renders payroll state and employee ledger.

## Submission checklist

- [ ] Smart contract + frontend demo both runnable
- [ ] Complete README and architecture notes
- [ ] 2-minute **real human on-camera** pitch video
- [ ] Demo shows confidentiality + role-based access behavior

## Notes

- For award submission, keep demo mode for reliability in video, and explicitly explain that production flow uses encrypted endpoints.
- If needed, add a dedicated production page that integrates Zama client SDK encryption and proof generation end-to-end.
