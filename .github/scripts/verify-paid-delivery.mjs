import fs from "node:fs";

const repoFull = process.env.GITHUB_REPOSITORY;
const [owner, repo] = repoFull.split("/");
const publicToken = process.env.GITHUB_TOKEN;
const deliveryToken = process.env.DELIVERY_PAT;
const deliveryRepo = process.env.DELIVERY_REPO;
const wallet = process.env.PAY_TO_WALLET.toLowerCase();
const usdtContract = process.env.USDT_CONTRACT.toLowerCase();
const minUsdt = Number(process.env.MIN_USDT || 5);
const minTxUnix = Number(process.env.MIN_TX_UNIX || 0);

if (!publicToken) throw new Error("GITHUB_TOKEN is missing");
if (!deliveryToken) throw new Error("DELIVERY_PAT is missing");

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const issue = await resolveIssue(event);
if (!issue) {
  console.log("No issue context found.");
  process.exit(0);
}

const issueText = [issue.title, issue.body || "", event.comment?.body || ""].join("\n");
const txHash = extractTxHash(issueText);
if (!txHash) {
  await ensureLabel("payment-needed", "eed202", "Waiting for a valid USDT transaction hash.");
  await addLabels(issue.number, ["payment-needed"]);
  await commentOnce(
    issue.number,
    "payment-needed",
    [
      "I could not find an Ethereum transaction hash in this issue.",
      "",
      "Pay at least 5 USDT on Ethereum / ERC-20 to:",
      "",
      `\`${process.env.PAY_TO_WALLET}\``,
      "",
      "Then edit this issue and include the transaction hash.",
    ].join("\n"),
  );
  process.exit(0);
}

const tx = await fetchJson(`https://api.ethplorer.io/getTxInfo/${encodeURIComponent(txHash)}?apiKey=freekey`);
const payment = findPayment(tx);
if (!payment.ok) {
  await ensureLabel("payment-needed", "eed202", "Waiting for verified USDT payment.");
  await addLabels(issue.number, ["payment-needed"]);
  await commentOnce(issue.number, `payment-failed-${txHash.slice(0, 10)}`, payment.message);
  process.exit(0);
}

const duplicate = await findDuplicatePaidIssue(txHash, issue.number);
if (duplicate) {
  await ensureLabel("payment-duplicate", "d73a4a", "Transaction hash was already used.");
  await addLabels(issue.number, ["payment-duplicate"]);
  await commentOnce(
    issue.number,
    `payment-duplicate-${txHash.slice(0, 10)}`,
    `This transaction hash already appears to be used in #${duplicate}. Please provide a fresh payment transaction.`,
  );
  process.exit(0);
}

await inviteBuyer(issue.user.login);
await ensureLabel("paid-verified", "0e8a62", "USDT payment verified and delivery access sent.");
await addLabels(issue.number, ["paid-verified"]);
await removeLabel(issue.number, "payment-needed");
await commentOnce(
  issue.number,
  `paid-verified-${txHash.slice(0, 10)}`,
  [
    `Payment verified: ${payment.amount} USDT.`,
    "",
    `@${issue.user.login}, you have been invited to the private delivery repository:`,
    "",
    `https://github.com/${deliveryRepo}`,
    "",
    "Accept the GitHub invitation to access QuickFix Landing Kit Pro.",
  ].join("\n"),
);

async function resolveIssue(eventPayload) {
  if (eventPayload.issue) return eventPayload.issue;
  const inputNumber = process.env.WORKFLOW_ISSUE_NUMBER;
  if (!inputNumber) return null;
  return githubJson(publicToken, `/repos/${owner}/${repo}/issues/${inputNumber}`);
}

function extractTxHash(text) {
  const match = String(text || "").match(/0x[a-fA-F0-9]{64}/);
  return match ? match[0] : "";
}

function findPayment(tx) {
  if (!tx || tx.error) return { ok: false, message: "The transaction could not be found by the verifier." };
  if (tx.success === false) return { ok: false, message: "The transaction exists but is not successful." };
  if ((tx.timestamp || 0) < minTxUnix) {
    return { ok: false, message: "The transaction is older than this paid-delivery launch window." };
  }
  if ((tx.confirmations || 0) < 3) {
    return { ok: false, message: "The transaction exists, but it needs at least 3 confirmations." };
  }
  const operations = Array.isArray(tx.operations) ? tx.operations : [];
  for (const operation of operations) {
    const token = operation.tokenInfo || {};
    if (String(token.address || "").toLowerCase() !== usdtContract) continue;
    if (String(operation.to || "").toLowerCase() !== wallet) continue;
    const decimals = Number(token.decimals || 6);
    const amount = Number(operation.value || 0) / 10 ** decimals;
    if (amount >= minUsdt) return { ok: true, amount };
  }
  return {
    ok: false,
    message: `No ${minUsdt}+ USDT ERC-20 transfer to ${process.env.PAY_TO_WALLET} was found in this transaction.`,
  };
}

async function findDuplicatePaidIssue(txHash, currentIssueNumber) {
  const query = encodeURIComponent(`repo:${owner}/${repo} ${txHash}`);
  const result = await githubJson(publicToken, `/search/issues?q=${query}`);
  const items = Array.isArray(result.items) ? result.items : [];
  for (const item of items) {
    if (item.number !== currentIssueNumber) return item.number;
  }
  return null;
}

async function inviteBuyer(username) {
  const response = await github(
    deliveryToken,
    `/repos/${deliveryRepo}/collaborators/${encodeURIComponent(username)}`,
    {
      method: "PUT",
      body: JSON.stringify({ permission: "pull" }),
    },
  );
  if (![201, 204].includes(response.status)) {
    const text = await response.text();
    throw new Error(`Could not invite ${username}: HTTP ${response.status} ${text}`);
  }
}

async function ensureLabel(name, color, description) {
  const existing = await github(publicToken, `/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`);
  if (existing.status === 200) return;
  await githubJson(publicToken, `/repos/${owner}/${repo}/labels`, {
    method: "POST",
    body: JSON.stringify({ name, color, description }),
  });
}

async function addLabels(issueNumber, labels) {
  await githubJson(publicToken, `/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels }),
  });
}

async function removeLabel(issueNumber, label) {
  const response = await github(publicToken, `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, {
    method: "DELETE",
  });
  if (![200, 204, 404].includes(response.status)) {
    throw new Error(`Could not remove label ${label}: HTTP ${response.status}`);
  }
}

async function commentOnce(issueNumber, marker, body) {
  const comments = await githubJson(publicToken, `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`);
  const needle = `<!-- cash-sprint:${marker} -->`;
  if (comments.some((comment) => String(comment.body || "").includes(needle))) return;
  await githubJson(publicToken, `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: `${needle}\n${body}` }),
  });
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Fetch failed: ${url} HTTP ${response.status}`);
  return response.json();
}

async function githubJson(token, path, options = {}) {
  const response = await github(token, path, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${path} failed: HTTP ${response.status} ${text}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function github(token, path, options = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
}
