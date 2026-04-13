const ABI = [
  "function owner() view returns (address)",
  "function demoMode() view returns (bool)",
  "function currentCycle() view returns (uint256)",
  "function configureEmployeePlain(address employee, uint64 monthlyStipend, bool enabled)",
  "function runPayroll(address[] workers)",
  "function claimPlain(uint64 claimAmount)",
  "function claim(bytes32 claimAmount, bytes inputProof)",
  "function treasuryMirror() view returns (uint64 allocated, uint64 claimed)",
  "function listEmployees() view returns (address[])",
  "function employeeMirror(address employee) view returns (uint64 monthlyStipend, uint64 accrued, uint64 claimed, bool enabled)",
];

let provider;
let signer;
let contract;
let currentLang = "en";

const I18N = {
  en: {
    nav: ["Pipeline", "Workflow", "Architecture", "Deployment"],
    docs: "Docs",
    eyebrow: "CyberPay AI-powered payroll engine | v2.0",
    heroTitle: "Confidential payroll automation engine",
    heroSubtitle:
      "From encrypted stipend setup and batch cycle execution to treasury aggregation and private claims, deliver a complete FHE-ready payroll workflow.",
    connectWallet: "Connect Wallet",
    viewGithub: "View GitHub",
    walletNotConnected: "Wallet: not connected",
  },
  zh: {
    nav: ["流程总览", "业务流程", "系统架构", "部署与日志"],
    docs: "文档",
    eyebrow: "CyberPay AI 驱动薪酬引擎 | v2.0",
    heroTitle: "隐私薪酬自动化引擎",
    heroSubtitle: "从加密薪酬配置、批量发薪到财务聚合与隐私领取，打造完整 FHE 薪酬流程。",
    connectWallet: "连接钱包",
    viewGithub: "查看 GitHub",
    walletNotConnected: "钱包：未连接",
  },
};

const el = {
  connectButton: document.getElementById("connectButton"),
  walletStatus: document.getElementById("walletStatus"),
  contractAddress: document.getElementById("contractAddress"),
  loadContractButton: document.getElementById("loadContractButton"),
  contractStatus: document.getElementById("contractStatus"),
  cycleStatus: document.getElementById("cycleStatus"),
  employeeAddressInput: document.getElementById("employeeAddressInput"),
  employeeStipendInput: document.getElementById("employeeStipendInput"),
  configureEmployeeButton: document.getElementById("configureEmployeeButton"),
  workersInput: document.getElementById("workersInput"),
  runPayrollButton: document.getElementById("runPayrollButton"),
  claimAmountInput: document.getElementById("claimAmountInput"),
  claimPlainButton: document.getElementById("claimPlainButton"),
  claimHandleInput: document.getElementById("claimHandleInput"),
  claimProofInput: document.getElementById("claimProofInput"),
  claimEncryptedButton: document.getElementById("claimEncryptedButton"),
  refreshDashboardButton: document.getElementById("refreshDashboardButton"),
  treasuryStatus: document.getElementById("treasuryStatus"),
  employeeBoard: document.getElementById("employeeBoard"),
  logBox: document.getElementById("logBox"),
  navLinks: Array.from(document.querySelectorAll(".nav-link")),
  langToggle: document.getElementById("langToggle"),
  docsButton: document.getElementById("docsButton"),
  viewGithubButton: document.getElementById("viewGithubButton"),
  i18nNodes: Array.from(document.querySelectorAll("[data-i18n]")),
};

function log(message) {
  const time = new Date().toLocaleTimeString();
  el.logBox.textContent = `[${time}] ${message}\n${el.logBox.textContent}`;
}

function applyLanguage(lang) {
  const pack = I18N[lang];
  currentLang = lang;
  el.navLinks.forEach((node, idx) => {
    node.textContent = pack.nav[idx] || node.textContent;
  });
  el.docsButton.textContent = pack.docs;
  el.connectButton.textContent = pack.connectWallet;
  el.viewGithubButton.textContent = pack.viewGithub;
  el.i18nNodes.forEach((node) => {
    const key = node.dataset.i18n;
    if (pack[key]) node.textContent = pack[key];
  });
  if (!signer) {
    el.walletStatus.textContent = pack.walletNotConnected;
  }
  el.langToggle.textContent = lang.toUpperCase();
}

async function preloadDeployment() {
  try {
    const res = await fetch("./deployment.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.address && ethers.isAddress(data.address)) {
      el.contractAddress.value = data.address;
      log(`Preloaded deployment: ${data.address} (chainId=${data.chainId})`);
    }
  } catch (_) {
    // Deployment file is optional for first-time setup.
  }
}

async function refreshCycle() {
  if (!contract) return;
  const cycle = await contract.currentCycle();
  el.cycleStatus.textContent = `Current cycle: ${cycle.toString()}`;
}

async function refreshDashboard() {
  if (!contract) return;

  const [allocated, claimed] = await contract.treasuryMirror();
  el.treasuryStatus.textContent = `Treasury mirror | allocated: ${allocated.toString()} | claimed: ${claimed.toString()}`;

  const employees = await contract.listEmployees();
  if (!employees.length) {
    el.employeeBoard.textContent = "No employees configured.";
    return;
  }

  const rows = [];
  for (const addr of employees) {
    const [monthly, accrued, claimedAmount, enabled] = await contract.employeeMirror(addr);
    rows.push(
      `${addr}\n  enabled=${enabled} monthly=${monthly.toString()} accrued=${accrued.toString()} claimed=${claimedAmount.toString()}`
    );
  }
  el.employeeBoard.textContent = rows.join("\n\n");
}

el.connectButton.addEventListener("click", async () => {
  if (!window.ethereum) {
    log("No wallet found. Install MetaMask first.");
    return;
  }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  el.walletStatus.textContent = `Wallet: ${await signer.getAddress()}`;
  log("Wallet connected.");
});

el.viewGithubButton.addEventListener("click", () => {
  window.open("https://github.com/", "_blank", "noopener,noreferrer");
});

el.docsButton.addEventListener("click", () => {
  window.open("./docs.html", "_blank", "noopener,noreferrer");
});

el.langToggle.addEventListener("click", () => {
  const next = currentLang === "en" ? "zh" : "en";
  applyLanguage(next);
});

el.navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    const targetId = link.dataset.target;
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

el.loadContractButton.addEventListener("click", async () => {
  if (!signer) {
    log("Connect wallet first.");
    return;
  }
  const address = el.contractAddress.value.trim();
  if (!ethers.isAddress(address)) {
    log("Contract address is invalid.");
    return;
  }
  contract = new ethers.Contract(address, ABI, signer);
  el.contractStatus.textContent = `Contract: ${address}`;
  await refreshCycle();
  const [owner, demoMode] = await Promise.all([contract.owner(), contract.demoMode()]);
  log(`Contract loaded. owner=${owner} demoMode=${demoMode}`);
  await refreshDashboard();
});

el.configureEmployeeButton.addEventListener("click", async () => {
  if (!contract) {
    log("Load contract first.");
    return;
  }

  const employee = el.employeeAddressInput.value.trim();
  const stipend = Number(el.employeeStipendInput.value.trim());

  if (!ethers.isAddress(employee)) {
    log("Employee address invalid.");
    return;
  }
  if (!Number.isFinite(stipend) || stipend < 0) {
    log("Stipend must be a non-negative number.");
    return;
  }

  const tx = await contract.configureEmployeePlain(employee, BigInt(Math.floor(stipend)), true);
  log(`configureEmployeePlain tx: ${tx.hash}`);
  await tx.wait();
  await refreshDashboard();
  log(`Employee configured: ${employee}`);
});

el.runPayrollButton.addEventListener("click", async () => {
  if (!contract) {
    log("Load contract first.");
    return;
  }

  const workers = el.workersInput.value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (!workers.every((w) => ethers.isAddress(w))) {
    log("Worker list contains invalid address.");
    return;
  }

  const tx = await contract.runPayroll(workers);
  log(`runPayroll tx submitted: ${tx.hash}`);
  await tx.wait();
  await refreshCycle();
  await refreshDashboard();
  log("Payroll cycle executed.");
});

el.claimPlainButton.addEventListener("click", async () => {
  if (!contract) {
    log("Load contract first.");
    return;
  }

  const amount = Number(el.claimAmountInput.value.trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    log("Claim amount should be > 0.");
    return;
  }

  const tx = await contract.claimPlain(BigInt(Math.floor(amount)));
  log(`claimPlain tx submitted: ${tx.hash}`);
  await tx.wait();
  await refreshDashboard();
  log("Claim (demo plain) executed.");
});

el.claimEncryptedButton.addEventListener("click", async () => {
  if (!contract) {
    log("Load contract first.");
    return;
  }

  const handle = el.claimHandleInput.value.trim();
  const proof = el.claimProofInput.value.trim();
  if (!handle || !proof) {
    log("Provide encrypted handle + proof.");
    return;
  }

  const tx = await contract.claim(handle, proof);
  log(`claim tx submitted: ${tx.hash}`);
  await tx.wait();
  await refreshDashboard();
  log("Claim (encrypted) executed.");
});

el.refreshDashboardButton.addEventListener("click", async () => {
  if (!contract) {
    log("Load contract first.");
    return;
  }
  await refreshCycle();
  await refreshDashboard();
  log("Dashboard refreshed.");
});

preloadDeployment();
applyLanguage("en");
