const BATCH_DISPERSE_ABI = [
  "function disperseNative(address[] recipients, uint256[] values) payable",
];

const state = {
  entries: [],
  selectedFamily: "",
  connectedAddress: "",
  provider: null,
  signer: null,
  connectedEvmChainId: "",
  evmContractAddress: "",
  evmPreferredChainId: "",
};

const $ = (id) => document.getElementById(id);

function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function detectChain(address) {
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return "evm";
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return "tron";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "solana";
  return "unknown";
}

function setStatus(message, type = "") {
  const statusEl = $("actionStatus");
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function familyLabel(chain) {
  if (chain === "evm") return "EVM";
  if (chain === "solana") return "Solana";
  if (chain === "tron") return "Tron";
  return "Unknown";
}

function normalizeEntries(entries) {
  return entries.map((row) => {
    const address = (row.address || "").trim();
    const amount = Number(row.amount);
    const chain = detectChain(address);
    const valid = Boolean(address && Number.isFinite(amount) && amount > 0 && chain !== "unknown");
    return { address, amount: Number.isFinite(amount) ? amount : 0, chain, valid };
  });
}

function addEmptyRows(count = 1) {
  for (let i = 0; i < count; i += 1) {
    state.entries.push({ address: "", amount: 0, chain: "unknown", valid: false });
  }
}

function ensureMinimumRows() {
  if (state.entries.length < 3) addEmptyRows(3 - state.entries.length);
}

function parseUploadText(raw) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => {
    const [address = "", amount = ""] = line.replace(/\s+/g, "").split(",");
    return { address, amount };
  });
}

function getActiveFamilies() {
  const unique = new Set(state.entries.filter((row) => row.valid).map((row) => row.chain));
  return [...unique];
}

function currentRows() {
  if (!state.selectedFamily) return [];
  return state.entries.filter((row) => row.valid && row.chain === state.selectedFamily);
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch("./deployment.json", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (data?.address && ethers.isAddress(data.address)) {
      state.evmContractAddress = data.address;
    }
    if (data?.chainId) {
      state.evmPreferredChainId = String(data.chainId);
    }
  } catch (_) {}
}

function updateStats() {
  const normalized = normalizeEntries(state.entries);
  const totalRows = normalized.filter((row) => row.address || row.amount).length;
  const validRows = normalized.filter((row) => row.valid).length;
  const totalAmount = normalized.filter((row) => row.valid).reduce((sum, row) => sum + row.amount, 0);
  const evmCount = normalized.filter((row) => row.chain === "evm" && row.valid).length;
  const solCount = normalized.filter((row) => row.chain === "solana" && row.valid).length;
  const tronCount = normalized.filter((row) => row.chain === "tron" && row.valid).length;

  $("totalRows").textContent = String(totalRows);
  $("validRows").textContent = String(validRows);
  $("totalAmount").textContent = totalAmount.toLocaleString();
  $("evmCount").textContent = `EVM: ${evmCount}`;
  $("solCount").textContent = `Solana: ${solCount}`;
  $("tronCount").textContent = `Tron: ${tronCount}`;
}

function renderTable() {
  const normalized = normalizeEntries(state.entries).filter((row) => row.address || row.amount);
  const tbody = $("previewTable");
  if (!normalized.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No data</td></tr>';
    return;
  }

  tbody.innerHTML = normalized.map((row, index) => {
    const statusClass = row.valid ? "badge-ok" : "badge-warn";
    const statusText = row.valid ? "Ready" : "Invalid";
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${row.address || "-"}</td>
        <td>${familyLabel(row.chain)}</td>
        <td>${row.amount ? row.amount : "-"}</td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
      </tr>
    `;
  }).join("");
}

function renderRows() {
  ensureMinimumRows();
  const wrap = $("entryRows");
  wrap.innerHTML = "";
  const normalized = normalizeEntries(state.entries);
  state.entries = normalized;

  normalized.forEach((row, index) => {
    const div = document.createElement("div");
    div.className = "entry-row";
    div.innerHTML = `
      <input data-kind="address" data-index="${index}" value="${row.address || ""}" placeholder="Wallet address" spellcheck="false" />
      <input data-kind="amount" data-index="${index}" value="${row.amount || ""}" placeholder="Amount" />
      <span class="row-chain-chip">${familyLabel(row.chain)}</span>
    `;
    wrap.appendChild(div);
  });
}

function renderNetworkChoices() {
  const families = getActiveFamilies();
  const wrap = $("networkChoices");
  wrap.innerHTML = "";

  if (!families.length) {
    state.selectedFamily = "";
    $("detectedHint").textContent = "The system will auto-detect available chains based on addresses.";
    $("selectedChainLabel").textContent = "No executable chain detected";
    return;
  }

  if (!families.includes(state.selectedFamily)) {
    state.selectedFamily = families[0];
  }

  families.forEach((family) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `network-option ${state.selectedFamily === family ? "active" : ""}`.trim();
    btn.textContent = familyLabel(family);
    btn.addEventListener("click", () => {
      state.selectedFamily = family;
      state.connectedAddress = "";
      state.signer = null;
      state.provider = null;
      $("connectBtn").textContent = "Connect Wallet";
      $("walletState").textContent = "Not Connected";
      renderAll();
      setStatus(`Selected ${familyLabel(family)}, proceed to next step`, "ok");
    });
    wrap.appendChild(btn);
  });

  $("detectedHint").textContent = `Detected chains: ${families.map((x) => familyLabel(x)).join(" / ")}`;
  $("selectedChainLabel").textContent = `Execution chain: ${familyLabel(state.selectedFamily)}`;
}

function updateButtons() {
  const hasValidRows = currentRows().length > 0;
  const connected = Boolean(state.connectedAddress);
  $("connectBtn").disabled = !hasValidRows;
  $("batchTransferBtn").disabled = !hasValidRows || !connected;
}

function updateStepUI() {
  const stepWallet = $("stepWallet");
  if (!stepWallet) return;
  if (getActiveFamilies().length) {
    stepWallet.classList.add("active");
  } else {
    stepWallet.classList.remove("active");
  }
}

function updateEvmControls() {
  // EVM runtime config is loaded internally from deployment.json, no UI hint needed.
}

async function connectEvmWallet() {
  if (!window.ethereum) {
    throw new Error("EVM wallet not detected");
  }
  await window.ethereum.request({ method: "eth_requestAccounts" });

  const preferChain = state.evmPreferredChainId;
  if (preferChain) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${Number(preferChain).toString(16)}` }],
      });
    } catch (_) {}
  }

  state.provider = new ethers.BrowserProvider(window.ethereum);
  state.signer = await state.provider.getSigner();
  state.connectedAddress = await state.signer.getAddress();
  const network = await state.provider.getNetwork();
  state.connectedEvmChainId = String(network.chainId);
}

async function connectSolanaWallet() {
  if (!window.solana?.connect) {
    throw new Error("Solana wallet not detected");
  }
  const wallet = await window.solana.connect();
  state.connectedAddress = wallet.publicKey.toString();
}

async function connectTronWallet() {
  if (!window.tronLink?.request) {
    throw new Error("Tron wallet not detected");
  }
  await window.tronLink.request({ method: "tron_requestAccounts" });
  state.connectedAddress = window.tronWeb?.defaultAddress?.base58 || "";
  if (!state.connectedAddress) {
    throw new Error("Tron wallet connection failed");
  }
}

async function connectWallet() {
  if (!currentRows().length || !state.selectedFamily) {
    setStatus("No executable addresses available", "warn");
    return;
  }

  setStatus("Connecting wallet...");

  if (state.selectedFamily === "evm") {
    await connectEvmWallet();
  } else if (state.selectedFamily === "solana") {
    await connectSolanaWallet();
  } else {
    await connectTronWallet();
  }

  $("walletState").textContent = `Connected ${shortAddr(state.connectedAddress)}`;
  $("connectBtn").textContent = `Connected: ${shortAddr(state.connectedAddress)}`;
  updateButtons();
  setStatus("Wallet connected. Ready to execute batch transfer.", "ok");
}

function toWeiAmounts(rows) {
  return rows.map((row) => ethers.parseEther(String(row.amount)));
}

async function runEvmBatchTransfer() {
  if (!state.signer) {
    throw new Error("Please connect an EVM wallet first");
  }
  const contractAddress = state.evmContractAddress;
  if (!ethers.isAddress(contractAddress)) {
    throw new Error("Missing valid EVM contract address in deployment.json");
  }

  const rows = currentRows();
  const recipients = rows.map((row) => row.address);
  const values = toWeiAmounts(rows);
  const totalValue = values.reduce((sum, item) => sum + item, 0n);

  const contract = new ethers.Contract(contractAddress, BATCH_DISPERSE_ABI, state.signer);
  const tx = await contract.disperseNative(recipients, values, { value: totalValue });
  setStatus(`Transaction submitted: ${tx.hash.slice(0, 10)}...`, "ok");
  await tx.wait();
  setStatus("Batch transfer completed", "ok");
}

async function runBatchTransfer() {
  const rows = currentRows();
  if (!rows.length) {
    setStatus("No executable records for this chain", "warn");
    return;
  }

  if (state.selectedFamily === "evm") {
    await runEvmBatchTransfer();
    return;
  }

  setStatus(`${familyLabel(state.selectedFamily)} batch contract execution reserved. Please integrate the chain contract first.`, "warn");
}

async function handleFileSelect(file) {
  const text = await file.text();
  state.entries = parseUploadText(text);
  ensureMinimumRows();
  state.entries = normalizeEntries(state.entries);

  const validCount = state.entries.filter((row) => row.valid).length;
  const invalidCount = state.entries.length - validCount;

  $("fileStatus").textContent = `Upload complete: ${validCount} valid, ${invalidCount} invalid`;
  $("fileStatus").className = `status ${validCount > 0 ? "ok" : "warn"}`;
  setStatus(validCount > 0 ? "Chains auto-detected. Connect wallet to proceed." : "No valid entries found in file", validCount > 0 ? "ok" : "warn");
  renderAll();
}

function downloadTemplate() {
  const sample = [
    "0x1111111111111111111111111111111111111111,0.10",
    "0x2222222222222222222222222222222222222222,0.25",
    "0x3333333333333333333333333333333333333333,0.50",
    "7xKXtg2CWG1WwQpP8iJ6X5tLVJdz6gr7VQZdb7jCzJj4,1.2",
    "6QWeT6FpJrm8AF1bP6f8mQYe8A9A4zXw2J7Y9m2LQ3sR,2.6",
    "9hJxN4vL2F7qBb8WQm5oPs3Rk6TzYc1Ud8eG2nV5aKpM,3.1",
    "TQvW5Y9nM3rP7sK2dF6hJ8L4cX1bN5qR2T,50",
    "TRxA7mN4cP9qL2vK5dS8hF1jW6yU3tR9QZ,75",
    "TYhD3qP8nK5vR1mL7sF4cX9jB2tW6zQ8UA,120",
  ].join("\n");

  const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "batch-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  $("uploadBtn").addEventListener("click", () => {
    $("fileInput").click();
  });

  $("fileInput").addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    await handleFileSelect(file);
  });

  $("downloadTemplate").addEventListener("click", (event) => {
    event.preventDefault();
    downloadTemplate();
  });

  $("connectBtn").addEventListener("click", async () => {
    try {
      await connectWallet();
    } catch (error) {
      setStatus(error.message || "Connection failed", "warn");
    }
  });

  $("batchTransferBtn").addEventListener("click", async () => {
    try {
      await runBatchTransfer();
    } catch (error) {
      setStatus(error.message || "Execution failed", "warn");
    }
  });

  $("addRowBtn").addEventListener("click", () => {
    addEmptyRows(1);
    renderAll();
  });

  $("entryRows").addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const index = Number(target.dataset.index);
    const kind = target.dataset.kind;
    if (!Number.isInteger(index) || index < 0 || index >= state.entries.length) return;
    if (kind === "address") state.entries[index].address = target.value.trim();
    if (kind === "amount") state.entries[index].amount = target.value;
    state.entries = normalizeEntries(state.entries);
    const row = state.entries[index];
    const rowWrap = target.closest(".entry-row");
    const chip = rowWrap?.querySelector(".row-chain-chip");
    if (chip) chip.textContent = familyLabel(row.chain);

    $("fileStatus").textContent = "List manually edited";
    $("fileStatus").className = "status ok";
    updateStats();
    renderTable();
    renderNetworkChoices();
    updateEvmControls();
    updateButtons();
    updateStepUI();
  });
}

function renderAll() {
  updateStats();
  renderRows();
  renderTable();
  renderNetworkChoices();
  updateEvmControls();
  updateButtons();
  updateStepUI();
}

async function init() {
  addEmptyRows(3);
  await loadRuntimeConfig();
  bindEvents();
  renderAll();
}

init();
