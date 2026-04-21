const ERC20_ABI = [
  "function transfer(address to, uint256 value) returns (bool)",
];

const $ = (id) => document.getElementById(id);

const DEFAULT_CONFIG = {
  evm: {
    chainId: 11155111,
    tokens: { USDT: "", USDC: "" },
    decimals: { USDT: 6, USDC: 6 },
  },
  solana: {
    rpc: "https://api.devnet.solana.com",
    tokens: {
      USDT: "H8UekPGwePSmQ3ttuYGPU1szyFfjZR4N53rymSFwpLPm",
      USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    },
    decimals: { USDT: 6, USDC: 6 },
  },
  tron: {
    fullHost: "https://nile.trongrid.io",
    tokens: {
      USDT: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
      USDC: "TEMVynQpntMqkPxP6wXTW2K7e4sM3cRmWz",
    },
    decimals: { USDT: 6, USDC: 6 },
  },
};

const state = {
  entries: [],
  confirmedEntries: [],
  connectedAddress: "",
  connectedFamily: "",
  provider: null,
  signer: null,
  config: structuredClone(DEFAULT_CONFIG),
  solanaWallet: null,
  solanaDeps: null,
  tronWeb: null,
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
  if (!el) return;
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

function mergeConfig(target, source) {
  if (!source || typeof source !== "object") return target;
  const out = { ...target };
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = mergeConfig(target[key] || {}, value);
    } else if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch("./deployment.json", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    state.config = mergeConfig(DEFAULT_CONFIG, data);
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
    tbody.innerHTML = '<tr><td colspan="4" class="empty">Click Confirm first</td></tr>';
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

function setSecondStageVisible(visible) {
  const stage = $("secondStage");
  if (!stage) return;
  stage.style.display = visible ? "block" : "none";
}

function markDirty() {
  state.confirmedEntries = [];
  state.connectedAddress = "";
  state.connectedFamily = "";
  state.provider = null;
  state.signer = null;
  state.solanaWallet = null;
  state.tronWeb = null;
  $("walletState").textContent = "Not Connected";
  $("connectSendBtn").disabled = true;
  setSecondStageVisible(false);
  renderPreview();
  renderSummary(normalizeEntries(state.entries).filter((row) => row.valid));
  setStatus("actionStatus", "List changed, please confirm again", "warn");
}

function confirmList() {
  state.entries = normalizeEntries(state.entries);
  const valid = state.entries.filter((row) => row.valid);
  if (!valid.length) {
    setStatus("fileStatus", "No valid rows to confirm", "warn");
    return;
  }

  state.confirmedEntries = valid.map((row) => ({ ...row }));
  setSecondStageVisible(true);
  renderPreview();
  renderSummary(state.confirmedEntries);
  $("connectSendBtn").disabled = false;
  setStatus("fileStatus", `Confirmed ${state.confirmedEntries.length} rows`, "ok");
  setStatus("actionStatus", "Ready to connect wallet and send", "ok");
}

async function connectEvmWallet() {
  if (!window.ethereum) throw new Error("EVM wallet not detected");
  await window.ethereum.request({ method: "eth_requestAccounts" });

  const chainId = state.config.evm?.chainId;
  if (chainId) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${Number(chainId).toString(16)}` }],
      });
    } catch (_) {}
  }

  state.provider = new ethers.BrowserProvider(window.ethereum);
  state.signer = await state.provider.getSigner();
  state.connectedAddress = await state.signer.getAddress();
  state.connectedFamily = "EVM";
}

async function ensureSolanaDeps() {
  if (state.solanaDeps) return state.solanaDeps;
  const web3 = await import("https://esm.sh/@solana/web3.js@1.95.3");
  const spl = await import("https://esm.sh/@solana/spl-token@0.4.9");
  state.solanaDeps = { web3, spl };
  return state.solanaDeps;
}

async function connectSolanaWallet() {
  if (!window.solana?.connect) throw new Error("Solana wallet not detected");
  const wallet = await window.solana.connect();
  state.solanaWallet = window.solana;
  state.connectedAddress = wallet.publicKey.toString();
  state.connectedFamily = "Solana";
}

async function connectTronWallet() {
  if (!window.tronLink?.request) throw new Error("TronLink wallet not detected");
  await window.tronLink.request({ method: "tron_requestAccounts" });
  if (!window.tronWeb?.defaultAddress?.base58) throw new Error("Failed to connect Tron wallet");
  state.tronWeb = window.tronWeb;
  state.connectedAddress = window.tronWeb.defaultAddress.base58;
  state.connectedFamily = "Tron";
}

async function ensureWalletForFamily(family) {
  if (state.connectedAddress && state.connectedFamily === family) return;
  if (family === "EVM") await connectEvmWallet();
  else if (family === "Solana") await connectSolanaWallet();
  else await connectTronWallet();
  $("walletState").textContent = `Connected ${shortAddr(state.connectedAddress)}`;
}

function getTokenConfig(family, token) {
  const section = family === "EVM" ? state.config.evm : family === "Solana" ? state.config.solana : state.config.tron;
  const tokenAddress = section?.tokens?.[token];
  const decimals = Number(section?.decimals?.[token] ?? 6);
  return { tokenAddress, decimals };
}

async function sendEvmRows(rows) {
  if (!state.signer) throw new Error("EVM wallet not connected");
  for (const row of rows) {
    const { tokenAddress, decimals } = getTokenConfig("EVM", row.token);
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      throw new Error(`EVM ${row.token} token address is not configured`);
    }
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, state.signer);
    const amount = ethers.parseUnits(String(row.amount), decimals);
    const tx = await contract.transfer(row.address, amount);
    setStatus("actionStatus", `EVM ${row.token} submitted: ${tx.hash.slice(0, 10)}...`, "ok");
    await tx.wait();
  }
}

async function sendSolanaRows(rows) {
  if (!state.solanaWallet?.publicKey) throw new Error("Solana wallet not connected");
  const { web3, spl } = await ensureSolanaDeps();
  const connection = new web3.Connection(state.config.solana.rpc || "https://api.devnet.solana.com", "confirmed");
  const sender = state.solanaWallet.publicKey;

  for (const row of rows) {
    const { tokenAddress, decimals } = getTokenConfig("Solana", row.token);
    if (!tokenAddress) throw new Error(`Solana ${row.token} mint is not configured`);

    const mint = new web3.PublicKey(tokenAddress);
    const recipient = new web3.PublicKey(row.address);
    const fromAta = await spl.getAssociatedTokenAddress(mint, sender);
    const toAta = await spl.getAssociatedTokenAddress(mint, recipient);

    const tx = new web3.Transaction();
    const toAtaInfo = await connection.getAccountInfo(toAta);
    if (!toAtaInfo) {
      tx.add(
        spl.createAssociatedTokenAccountInstruction(
          sender,
          toAta,
          recipient,
          mint,
        ),
      );
    }

    const base = 10 ** decimals;
    const amount = BigInt(Math.round(row.amount * base));
    tx.add(
      spl.createTransferCheckedInstruction(
        fromAta,
        mint,
        toAta,
        sender,
        amount,
        decimals,
      ),
    );

    tx.feePayer = sender;
    tx.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;

    let signature = "";
    if (state.solanaWallet.signAndSendTransaction) {
      const result = await state.solanaWallet.signAndSendTransaction(tx);
      signature = typeof result === "string" ? result : result.signature;
    } else if (state.solanaWallet.signTransaction) {
      const signed = await state.solanaWallet.signTransaction(tx);
      signature = await connection.sendRawTransaction(signed.serialize());
    } else {
      throw new Error("Current Solana wallet does not support sign+send");
    }
    await connection.confirmTransaction(signature, "confirmed");
    setStatus("actionStatus", `Solana ${row.token} sent: ${signature.slice(0, 10)}...`, "ok");
  }
}

async function sendTronRows(rows) {
  const tronWeb = state.tronWeb || window.tronWeb;
  if (!tronWeb) throw new Error("Tron wallet not connected");

  for (const row of rows) {
    const { tokenAddress, decimals } = getTokenConfig("Tron", row.token);
    if (!tokenAddress) throw new Error(`Tron ${row.token} token address is not configured`);
    const contract = await tronWeb.contract().at(tokenAddress);
    const amount = Math.round(row.amount * (10 ** decimals));
    const txid = await contract.transfer(row.address, amount).send({
      feeLimit: 100_000_000,
      shouldPollResponse: true,
    });
    setStatus("actionStatus", `Tron ${row.token} sent: ${String(txid).slice(0, 10)}...`, "ok");
  }
}

async function connectAndSend() {
  if (!state.confirmedEntries.length) {
    setStatus("actionStatus", "Please confirm the list first", "warn");
    return;
  }

  const families = [...new Set(state.confirmedEntries.map((row) => row.chain))]
    .filter((family) => ["EVM", "Solana", "Tron"].includes(family));

  if (!families.length) {
    setStatus("actionStatus", "No executable chain detected", "warn");
    return;
  }

  for (const family of families) {
    const rows = state.confirmedEntries.filter((row) => row.chain === family);
    setStatus("actionStatus", `Processing ${family} (${rows.length} rows)...`);
    await ensureWalletForFamily(family);
    if (family === "EVM") await sendEvmRows(rows);
    else if (family === "Solana") await sendSolanaRows(rows);
    else await sendTronRows(rows);
  }

  setStatus("actionStatus", "All chain batches completed", "ok");
}

function downloadTemplate() {
  const sample = [
    "0x1111111111111111111111111111111111111111,0.10,USDT",
    "0x2222222222222222222222222222222222222222,0.25,USDC",
    "0x3333333333333333333333333333333333333333,0.50,USDT",
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
    setStatus("fileStatus", "File loaded, review and click Confirm", "ok");
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
    setStatus("fileStatus", "List edited manually, please click Confirm");
  });

  $("confirmBtn").addEventListener("click", confirmList);

  $("connectSendBtn").addEventListener("click", async () => {
    try {
      await connectAndSend();
    } catch (error) {
      setStatus("actionStatus", error.message || "Execution failed", "warn");
    }
  });
}

async function init() {
  addEmptyRows(3);
  await loadRuntimeConfig();
  setSecondStageVisible(false);
  renderRows();
  renderPreview();
  renderSummary([]);
  bindEvents();
}

init();
