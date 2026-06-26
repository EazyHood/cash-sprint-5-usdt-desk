const wallet = "0x06f44f4839fd5df4f4670036d028b29dec939363";
const usdtContract = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const orderIssueUrl = "https://github.com/EazyHood/cash-sprint-5-usdt-desk/issues/new";

const copyButton = document.querySelector("#copyWallet");
const orderForm = document.querySelector("#orderForm");
const unlockForm = document.querySelector("#unlockForm");
const invoiceForm = document.querySelector("#invoiceForm");
const invoiceAmount = document.querySelector("#invoiceAmount");
const invoiceItem = document.querySelector("#invoiceItem");
const invoiceMemo = document.querySelector("#invoiceMemo");
const invoiceQr = document.querySelector("#invoiceQr");
const invoiceText = document.querySelector("#invoiceText");
const invoiceWalletLink = document.querySelector("#invoiceWalletLink");
const copyInvoice = document.querySelector("#copyInvoice");
const unlockTx = document.querySelector("#unlockTx");
const unlockStatus = document.querySelector("#unlockStatus");
const downloadPack = document.querySelector("#downloadPack");
const repoLink = document.querySelector("#repoLink");
const radarUpdated = document.querySelector("#radarUpdated");
const statusGrid = document.querySelector("#statusGrid");
const submittedPrList = document.querySelector("#submittedPrList");
const opportunityList = document.querySelector("#opportunityList");
const previewBox = document.querySelector("#landingPreview");

repoLink.href = orderIssueUrl;

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(wallet);
    copyButton.textContent = "Copied";
    setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1600);
  } catch {
    copyButton.textContent = "Select";
  }
});

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const taskType = document.querySelector("#taskType").value.trim();
  const budget = document.querySelector("#budget").value.trim();
  const txHash = document.querySelector("#txHash").value.trim();
  const request = document.querySelector("#request").value.trim();

  const title = `[USDT order] ${taskType} - $${budget}`;
  const body = [
    "## Payment",
    `- Asset/network: USDT on Ethereum / ERC-20`,
    `- Wallet used: ${wallet}`,
    `- Amount sent: $${budget}`,
    `- Transaction hash: ${txHash || "(pending)"}`,
    "",
    "## Task",
    `- Type: ${taskType}`,
    "",
    request,
    "",
    "## Delivery expectation",
    "Small static deliverable or focused front-end fix.",
  ].join("\n");

  const url = new URL(orderIssueUrl);
  url.searchParams.set("title", title);
  url.searchParams.set("body", body);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
});

invoiceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  updateInvoice();
});

copyInvoice.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(invoiceText.value);
    copyInvoice.textContent = "Copied";
    setTimeout(() => {
      copyInvoice.textContent = "Copy invoice";
    }, 1600);
  } catch {
    invoiceText.focus();
    invoiceText.select();
  }
});

[invoiceAmount, invoiceItem, invoiceMemo].forEach((field) => {
  field.addEventListener("input", updateInvoice);
});

unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const txHash = unlockTx.value.trim();
  downloadPack.hidden = true;
  unlockStatus.textContent = "Checking transaction on Ethereum...";

  if (!/^0x[a-f0-9]{64}$/i.test(txHash)) {
    unlockStatus.textContent = "Paste a valid Ethereum transaction hash.";
    return;
  }

  try {
    const tx = await fetchTx(txHash);
    const match = findUsdtPayment(tx);
    if (!match) {
      unlockStatus.textContent = "No 5+ USDT ERC-20 transfer to this wallet was found in that transaction.";
      return;
    }
    if (tx.success === false) {
      unlockStatus.textContent = "That transaction is not marked successful.";
      return;
    }
    if ((tx.confirmations || 0) < 3) {
      unlockStatus.textContent = "Transaction found, waiting for at least 3 confirmations.";
      return;
    }
    const title = `[Paid delivery] QuickFix Landing Kit Pro - ${txHash.slice(0, 12)}`;
    const brand = document.querySelector("#unlockBrand").value.trim();
    const audience = document.querySelector("#unlockAudience").value.trim();
    const offer = document.querySelector("#unlockOffer").value.trim();
    const cta = document.querySelector("#unlockCta").value.trim();
    const contact = document.querySelector("#unlockContact").value.trim();
    const theme = document.querySelector("#unlockTheme").value.trim();
    const body = [
      "## Paid delivery request",
      "",
      "Product: QuickFix Landing Kit Pro",
      `Transaction hash: ${txHash}`,
      `Wallet paid: ${wallet}`,
      `Detected amount: ${money(match.amount)} USDT`,
      "",
      "## Landing inputs",
      "",
      `Brand: ${brand || "QuickLaunch"}`,
      `Audience: ${audience || "busy customers"}`,
      `Offer: ${offer || "A focused service delivered quickly"}`,
      `CTA: ${cta || "Request a quote"}`,
      `Contact: ${contact || "https://github.com/EazyHood"}`,
      `Theme: ${theme || "green"}`,
      "",
      "The delivery automation will verify this transaction again and invite this GitHub user to the private delivery repository.",
    ].join("\n");
    const issueUrl = new URL(orderIssueUrl);
    issueUrl.searchParams.set("title", title);
    issueUrl.searchParams.set("body", body);
    unlockStatus.textContent = `Verified ${money(match.amount)} USDT. Open the delivery issue to receive private repo access.`;
    downloadPack.href = issueUrl.toString();
    downloadPack.hidden = false;
    downloadPack.focus();
  } catch (error) {
    unlockStatus.textContent = `Could not verify automatically: ${error.message}`;
  }
});

["#unlockBrand", "#unlockAudience", "#unlockOffer", "#unlockCta", "#unlockTheme"].forEach((selector) => {
  document.querySelector(selector).addEventListener("input", updatePreview);
});

updatePreview();
updateInvoice();

async function fetchTx(txHash) {
  const url = `https://api.ethplorer.io/getTxInfo/${encodeURIComponent(txHash)}?apiKey=freekey`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`verification API returned HTTP ${response.status}`);
  return response.json();
}

function findUsdtPayment(tx) {
  const operations = Array.isArray(tx.operations) ? tx.operations : [];
  for (const operation of operations) {
    const token = operation.tokenInfo || {};
    const tokenAddress = String(token.address || "").toLowerCase();
    const toAddress = String(operation.to || "").toLowerCase();
    if (tokenAddress !== usdtContract || toAddress !== wallet.toLowerCase()) continue;
    const decimals = Number(token.decimals || 6);
    const rawValue = Number(operation.value || 0);
    const amount = rawValue / 10 ** decimals;
    if (amount >= 5) return { amount, operation };
  }
  return null;
}

function updatePreview() {
  const brand = document.querySelector("#unlockBrand").value.trim() || "QuickLaunch";
  const audience = document.querySelector("#unlockAudience").value.trim() || "busy customers";
  const offer = document.querySelector("#unlockOffer").value.trim() || "A focused service delivered quickly";
  const cta = document.querySelector("#unlockCta").value.trim() || "Request a quote";
  const theme = document.querySelector("#unlockTheme").value.trim();
  const colors = {
    green: "#0f8a62",
    blue: "#245f99",
    gold: "#a86d12",
    rose: "#a83f65",
  };
  previewBox.querySelector("strong").textContent = brand;
  previewBox.querySelector("p").textContent = `Built for ${audience}. ${offer}.`;
  previewBox.querySelector(".previewButton").textContent = cta;
  previewBox.querySelector(".previewButton").style.background = colors[theme] || colors.green;
}

function money(value) {
  if (typeof value !== "number") return "n/a";
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

function updateInvoice() {
  const amount = Math.max(5, Number(invoiceAmount.value || 5));
  const item = invoiceItem.value.trim() || "Quick web fix";
  const memo = invoiceMemo.value.trim() || item;
  const rawAmount = Math.round(amount * 1_000_000);
  const deeplink = `ethereum:${usdtContract}/transfer?address=${wallet}&uint256=${rawAmount}`;
  const text = [
    `USDT Quick Fix Desk invoice`,
    `Item: ${item}`,
    `Memo: ${memo}`,
    `Amount: ${amount.toFixed(amount % 1 === 0 ? 0 : 2)} USDT`,
    `Network: Ethereum / ERC-20`,
    `Token: USDT (${usdtContract})`,
    `Recipient: ${wallet}`,
    `Wallet deeplink: ${deeplink}`,
    `Order page: ${window.location.origin}${window.location.pathname}`,
  ].join("\n");
  invoiceWalletLink.href = deeplink;
  invoiceText.value = text;
  invoiceQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(deeplink)}`;
}

function renderCounts(counts = {}, targetStatus = {}) {
  const items = [
    [targetStatus.earned_verified_usd || 0, "verified USDT/USDC"],
    ["actionable", "actionable"],
    ["manual_review", "manual review"],
    ["watch", "watch"],
  ];
  statusGrid.innerHTML = items
    .map(
      ([key, label]) => `
        <div class="statusCard">
          <strong>${typeof key === "number" ? money(key) : counts[key] || 0}</strong>
          <span>${label}</span>
        </div>
      `,
    )
    .join("");
}

function renderOpportunities(opportunities = []) {
  const filtered = opportunities.filter((item) => item.status !== "rejected").slice(0, 6);
  if (!filtered.length) {
    opportunityList.innerHTML = "";
    return;
  }
  opportunityList.innerHTML = filtered
    .map(
      (item) => `
        <li>
          <a href="${item.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
          <div class="oppMeta">
            <span>${escapeHtml(item.status)}</span>
            <span>${money(item.amount_usd)}</span>
            <span>score ${item.score}</span>
            <span>${item.comments} comments</span>
          </div>
        </li>
      `,
    )
    .join("");
}

function renderSubmittedWork(prs = [], issues = []) {
  if (!submittedPrList) return;
  const items = [
    ...prs.map((item) => ({ ...item, submittedType: "PR" })),
    ...issues.map((item) => ({ ...item, submittedType: item.type || "Issue" })),
  ];
  if (!items.length) {
    submittedPrList.innerHTML = "";
    return;
  }
  submittedPrList.innerHTML = items
    .map((item) => {
      const reward =
        typeof item.estimated_reward_usdc === "number"
          ? `~${money(item.estimated_reward_usdc)}`
          : "review-dependent";
      const mergeable =
        item.submittedType === "PR"
          ? item.mergeable === null
            ? "mergeable pending"
            : `mergeable ${item.mergeable}`
          : escapeHtml(item.submittedType);
      return `
        <li>
          <a href="${item.url || item.api_url}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(item.repo)}#${item.number}: ${escapeHtml(item.title || "submitted work")}
          </a>
          <div class="oppMeta">
            <span>${escapeHtml(item.status || "unknown")}</span>
            <span>${reward}</span>
            <span>${mergeable}</span>
          </div>
        </li>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadRadar() {
  try {
    const response = await fetch("latest_state.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const state = await response.json();
    radarUpdated.textContent = `Latest scan: ${state.generated_at_utc}`;
    renderCounts(state.counts, state.target_status);
    renderSubmittedWork(state.submitted_pull_requests, state.submitted_reward_issues);
    renderOpportunities(state.top_opportunities);
  } catch {
    radarUpdated.textContent = "Run cash_sprint.py scan to publish the latest local radar.";
    renderCounts({});
    renderSubmittedWork([]);
  }
}

loadRadar();
