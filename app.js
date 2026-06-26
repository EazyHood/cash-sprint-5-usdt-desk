const wallet = "0x06f44f4839fd5df4f4670036d028b29dec939363";
const orderIssueUrl = "https://github.com/EazyHood/cash-sprint-5-usdt-desk/issues/new";

const copyButton = document.querySelector("#copyWallet");
const orderForm = document.querySelector("#orderForm");
const repoLink = document.querySelector("#repoLink");
const radarUpdated = document.querySelector("#radarUpdated");
const statusGrid = document.querySelector("#statusGrid");
const opportunityList = document.querySelector("#opportunityList");

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

function money(value) {
  if (typeof value !== "number") return "n/a";
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

function renderCounts(counts = {}) {
  const items = [
    ["actionable", "actionable"],
    ["manual_review", "manual review"],
    ["watch", "watch"],
  ];
  statusGrid.innerHTML = items
    .map(
      ([key, label]) => `
        <div class="statusCard">
          <strong>${counts[key] || 0}</strong>
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
    renderCounts(state.counts);
    renderOpportunities(state.top_opportunities);
  } catch {
    radarUpdated.textContent = "Run cash_sprint.py scan to publish the latest local radar.";
    renderCounts({});
  }
}

loadRadar();
