# CyberPay Payroll - Winning-Oriented Submission Guide

## One-line pitch

CyberPay Payroll enables confidential onchain payroll where employee-level amounts remain encrypted while finance and auditors can access policy-approved aggregate views.

## Judging criteria mapping

### Innovation
- Encrypted payroll + encrypted treasury aggregation in one workflow.
- Confidential-by-default data model with selective decryption permissions.

### Compliance awareness
- Designed for KYC-ed employee list managed offchain.
- Onchain stores only encrypted salary values and role-based access controls.
- Treasury audit focuses on aggregate amounts instead of exposing personal salaries.

### Real-world potential
- Payroll is a recurring enterprise need.
- Integrates with existing HR and treasury approval pipelines.

### Technical implementation
- Uses `euint64` state for monthly stipend, accrued, claimed, and treasury totals.
- Executes add/sub operations on encrypted values inside smart contract logic.

### Production readiness
- Minimal but complete flow: configure -> run payroll -> claim -> treasury snapshot.
- Deterministic demo path suitable for 2-minute showcase.

### Usability
- Frontend gives concise action flow for admins and employees.
- Setup scripts and docs minimize reviewer setup effort.

## 2-minute demo script

### 0:00 - 0:20 Problem
- Public blockchains expose salary info.
- Institutions need confidentiality plus auditability.

### 0:20 - 0:45 Solution
- CyberPay Payroll keeps salary amounts encrypted end-to-end.
- Smart contract computes payroll on ciphertext using Zama FHE primitives.

### 0:45 - 1:35 Live demo
- Show contract address and wallet connection.
- Admin runs one payroll cycle for two workers.
- Employee claims stipend.
- Show cycle advancement and transaction proofs.

### 1:35 - 2:00 Why it matters
- Enables real payroll use case without leaking sensitive compensation data.
- Compliance-friendly via role-based and aggregate-first visibility.

## Demo safety checklist

- Use fixed wallets and pre-funded accounts.
- Keep one deterministic script path to avoid live mistakes.
- Prepare fallback local deployment in case testnet latency appears.
