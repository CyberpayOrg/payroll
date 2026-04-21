const BATCH_DISPERSE_ABI = [
  "function disperseNative(address[] recipients, uint256[] values) payable",
];

const $ = (id) => document.getElementById(id);

const state = {
  entries: [],
  confirmedEntries: [],
  connectedAddress: "",
  connectedFamily: "",
  provider: null,
  signer: null,
  evmContractAddress: "",
  evmPreferredChainId: "",
};

function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function detectChain(address) {
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return "EVM";
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return "Tron";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "Solana";
  return "Unknown";
}

function normalizeEntries(entries) {
  return entries.map((row) => {
    const address = (row.address || "").trim();
    const amount = Number(row.amount);
    const token = row.token || "USDT";
    const chain = detectChain(address);
    const valid = Boolean(address && Number.isFinite(amount) && amount > 0 && chain !== "Unknown");
    return { address, amount: Number.isFinite(amount) ? amount : 0, chain, token, valid };
  });
}

function addEmptyRows(count = 1) {
  for (let i = 0; i < count; i += 1) {
    state.entries.push({ address: "", amount: "", token: "USDT", chain: "Unknown", valid: false });
  }
}

function ensureMinimumRows() {
  if (state.entries.length < 3) addEmptyRows(3 - state.entries.length);
}

function setStatus(id, text, type = "") {
  const el = $(id);
  el.textContent = text;
  el.className = `status ${type}`.trim();
}

function parseUploadText(raw) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => {
    const [address = "", amount = "", token = "USDT"] = line.replace(/\s+/g, "").split(",");
    return { address, amount, token: token.toUpperCase() === "USDC" ? "USDC" : "USDT" };
  });
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch("./deployment.json", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (data?.address && ethers.isAddress(data.address)) state.evmContractAddress = data.address;
    if (data?.chainId) state.evmPreferredChainId = String(data.chainId);
  } catch (_) {}
}

function renderRows() {
  ensureMinimumRows();
  state.entries = normalizeEntries(state.entries);
  const wrap = $("entryRows");
  wrap.innerHTML = "";

  state.entries.forEach((row, index) => {
    const line = document.createElement("div");
    line.className = "entry-row";
    line.innerHTML = `
      <input data-kind="address" data-index="${index}" value="${row.address}" placeholder="wallet address" spellcheck="false" />
      <span class="readonly-cell">${row.chain}</span>
      <input data-kind="amount" data-index="${index}" value="${row.amount || ""}" placeholder="amount" />
      <select data-kind="token" data-index="${index}">
        <option value="USDT" ${row.token === "USDT" ? "selected" : ""}>USDT</option>
        <option value="USDC" ${row.token === "USDC" ? "selected" : ""}>USDC</option>
      </select>
    `;
    wrap.appendChild(line);
  });
}

function renderSummary(entries) {
  const totalRows = entries.length;
  const validRows = entries.filter((row) => row.valid).length;
  const totalAmount = entries.filter((row) => row.valid).reduce((sum, row) => sum + row.amount, 0);
  const evmCount = entries.filter((row) => row.valid && row.chain === "EVM").length;
  const solCount = entries.filter((row) => row.valid && row.chain === "Solana").length;
  const tronCount = entries.filter((row) => row.valid && row.chain === "Tron").length;

  $("totalRows").textContent = String(totalRows);
  $("validRows").textContent = String(validRows);
  $("totalAmount").textContent = totalAmount.toLocaleString();
  $("evmCount").textContent = `EVM: ${evmCount}`;
  $("solCount").textContent = `Solana: ${solCount}`;
  $("tronCount").textContent = `Tron: ${tronCount}`;
}

function renderPreview() {
  const tbody = $("previewTable");
  if (!state.confirmedEntries.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">请先点击 Confirm</td></tr>';
    return;
  }

  tbody.innerHTML = state.confirmedEntries.map((row) => `
    <tr>
      <td>${row.address}</td>
      <td>${row.chain}</td>
      <td>${row.amount}</td>
      <td>${row.token}</td>
    </tr>
  `).join("");
}

function markDirty() {
  state.confirmedEntries = [];
  state.connectedAddress = "";
  state.connectedFamily = "";
  state.provider = null;
  state.signer = null;
  $("walletState").textContent = "未连接";
  $("connectSendBtn").disabled = true;
  renderPreview();
  renderSummary(normalizeEntries(state.entries).filter((row) => row.valid));
  setStatus("actionStatus", "名单已变更，请先 Confirm", "warn");
}

function confirmList() {
  state.entries = normalizeEntries(state.entries);
  const valid = state.entries.filter((row) => row.valid);
  if (!valid.length) {
    setStatus("fileStatus", "没有可确认的有效条目", "warn");
    return;
  }

  state.confirmedEntries = valid.map((row) => ({ ...row }));
  renderPreview();
  renderSummary(state.confirmedEntries);
  $("connectSendBtn").disabled = false;
  setStatus("fileStatus", `已确认 ${state.confirmedEntries.length} 条`, "ok");
  setStatus("actionStatus", "可连接钱包并发送", "ok");
}

async function connectEvmWallet() {
  if (!window.ethereum) throw new Error("未检测到 EVM 钱包");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  if (state.evmPreferredChainId) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${Number(state.evmPreferredChainId).toString(16)}` }],
      });
    } catch (_) {}
  }
  state.provider = new ethers.BrowserProvider(window.ethereum);
  state.signer = await state.provider.getSigner();
  state.connectedAddress = await state.signer.getAddress();
  state.connectedFamily = "EVM";
}

async function connectSolanaWallet() {
  if (!window.solana?.connect) throw new Error("未检测到 Solana 钱包");
  const wallet = await window.solana.connect();
  state.connectedAddress = wallet.publicKey.toString();
  state.connectedFamily = "Solana";
}

async function connectTronWallet() {
  if (!window.tronLink?.request) throw new Error("未检测到 Tron 钱包");
  await window.tronLink.request({ method: "tron_requestAccounts" });
  state.connectedAddress = window.tronWeb?.defaultAddress?.base58 || "";
  if (!state.connectedAddress) throw new Error("Tron 钱包连接失败");
  state.connectedFamily = "Tron";
}

async function ensureWalletForFamily(family) {
  if (state.connectedAddress && state.connectedFamily === family) return;
  if (family === "EVM") await connectEvmWallet();
  else if (family === "Solana") await connectSolanaWallet();
  else await connectTronWallet();
  $("walletState").textContent = `已连接 ${shortAddr(state.connectedAddress)}`;
}

async function sendEvmBatch(rows) {
  if (!state.signer) throw new Error("EVM 钱包未连接");
  if (!ethers.isAddress(state.evmContractAddress)) {
    throw new Error("deployment.json 未配置 EVM 合约地址");
  }
  const recipients = rows.map((row) => row.address);
  const values = rows.map((row) => ethers.parseUnits(String(row.amount), 6));
  const totalValue = values.reduce((sum, item) => sum + item, 0n);
  const contract = new ethers.Contract(state.evmContractAddress, BATCH_DISPERSE_ABI, state.signer);
  const tx = await contract.disperseNative(recipients, values, { value: totalValue });
  setStatus("actionStatus", `交易已提交: ${tx.hash.slice(0, 10)}...`, "ok");
  await tx.wait();
}

async function connectAndSend() {
  if (!state.confirmedEntries.length) {
    setStatus("actionStatus", "请先 Confirm 名单", "warn");
    return;
  }

  const families = [...new Set(state.confirmedEntries.map((row) => row.chain))];
  if (families.length !== 1) {
    setStatus("actionStatus", "当前版本一次仅支持单链发送，请按链分批 Confirm", "warn");
    return;
  }

  const family = families[0];
  setStatus("actionStatus", "正在连接钱包...", "");
  await ensureWalletForFamily(family);

  if (family === "EVM") {
    await sendEvmBatch(state.confirmedEntries);
    setStatus("actionStatus", "发送完成", "ok");
    return;
  }

  setStatus("actionStatus", `${family} 发送已预留入口，待接入该链合约`, "warn");
}

function downloadTemplate() {
  const sample = [
    "0x1111111111111111111111111111111111111111,0.10,USDT",
    "0x2222222222222222222222222222222222222222,0.25,USDT",
    "0x3333333333333333333333333333333333333333,0.50,USDC",
    "7xKXtg2CWG1WwQpP8iJ6X5tLVJdz6gr7VQZdb7jCzJj4,1.2,USDT",
    "6QWeT6FpJrm8AF1bP6f8mQYe8A9A4zXw2J7Y9m2LQ3sR,2.6,USDC",
    "9hJxN4vL2F7qBb8WQm5oPs3Rk6TzYc1Ud8eG2nV5aKpM,3.1,USDT",
    "TQvW5Y9nM3rP7sK2dF6hJ8L4cX1bN5qR2T,50,USDT",
    "TRxA7mN4cP9qL2vK5dS8hF1jW6yU3tR9QZ,75,USDC",
    "TYhD3qP8nK5vR1mL7sF4cX9jB2tW6zQ8UA,120,USDT",
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
  $("uploadBtn").addEventListener("click", () => $("fileInput").click());

  $("fileInput").addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    const text = await file.text();
    state.entries = parseUploadText(text);
    ensureMinimumRows();
    renderRows();
    markDirty();
    setStatus("fileStatus", "文件已载入，请检查后 Confirm", "ok");
  });

  $("downloadTemplate").addEventListener("click", (event) => {
    event.preventDefault();
    downloadTemplate();
  });

  $("addRowBtn").addEventListener("click", () => {
    addEmptyRows(1);
    renderRows();
    markDirty();
  });

  $("entryRows").addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
    const index = Number(target.dataset.index);
    const kind = target.dataset.kind;
    if (!Number.isInteger(index) || index < 0 || index >= state.entries.length) return;
    if (kind === "address") state.entries[index].address = target.value;
    if (kind === "amount") state.entries[index].amount = target.value;
    if (kind === "token") state.entries[index].token = target.value;
    state.entries = normalizeEntries(state.entries);
    renderRows();
    markDirty();
    setStatus("fileStatus", "已手动编辑，请点击 Confirm", "");
  });

  $("confirmBtn").addEventListener("click", confirmList);

  $("connectSendBtn").addEventListener("click", async () => {
    try {
      await connectAndSend();
    } catch (error) {
      setStatus("actionStatus", error.message || "执行失败", "warn");
    }
  });
}

async function init() {
  addEmptyRows(3);
  await loadRuntimeConfig();
  renderRows();
  renderPreview();
  renderSummary([]);
  bindEvents();
}

init();
