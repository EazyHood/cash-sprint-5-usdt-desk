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
const generated = await generateCustomLanding(issue, issueText, txHash, payment.amount);
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
    "",
    "Your generated landing page files were also created here:",
    "",
    generated.url,
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

async function generateCustomLanding(issueData, sourceText, txHash, paidAmount) {
  const fields = parseOrderFields(sourceText);
  const brand = fields.brand || fields.business || "QuickLaunch";
  const audience = fields.audience || "busy customers";
  const offer = fields.offer || "a focused service delivered quickly";
  const cta = fields.cta || "Request a quote";
  const contact = fields.contact || `https://github.com/${issueData.user.login}`;
  const theme = normalizeTheme(fields.theme || fields.color || "green");
  const slug = `orders/order-${issueData.number}`;
  const files = {
    [`${slug}/README.md`]: renderOrderReadme({ issueData, brand, audience, offer, cta, contact, txHash, paidAmount }),
    [`${slug}/index.html`]: renderLandingHtml({ brand, audience, offer, cta, contact }),
    [`${slug}/styles.css`]: renderLandingCss(theme),
    [`${slug}/script.js`]: "document.querySelector('[data-year]').textContent = new Date().getFullYear();\n",
  };

  for (const [path, content] of Object.entries(files)) {
    await putDeliveryFile(path, content, `Add generated landing for paid order #${issueData.number}`);
  }

  return { path: slug, url: `https://github.com/${deliveryRepo}/tree/main/${slug}` };
}

function parseOrderFields(text) {
  const fields = {};
  const aliases = {
    brand: ["brand", "business", "business name", "name", "marca", "negocio"],
    audience: ["audience", "customers", "target", "publico", "público", "cliente"],
    offer: ["offer", "service", "product", "oferta", "servicio", "producto"],
    cta: ["cta", "button", "call to action", "boton", "botón"],
    contact: ["contact", "url", "email", "link", "contacto"],
    theme: ["theme", "color", "tema"],
  };
  const lines = String(text || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*(?:[-*]\s*)?([^:]{2,40})\s*:\s*(.+?)\s*$/);
    if (match) {
      assignField(fields, aliases, match[1].trim().toLowerCase(), match[2].trim());
      continue;
    }
    const heading = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (!heading) continue;
    const key = heading[1].trim().toLowerCase();
    let value = "";
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next].trim();
      if (!candidate) continue;
      if (candidate.startsWith("#")) break;
      value = candidate;
      break;
    }
    if (value) assignField(fields, aliases, key, value);
  }
  return fields;
}

function assignField(fields, aliases, key, value) {
  for (const [canonical, keys] of Object.entries(aliases)) {
    if (keys.includes(key)) fields[canonical] = value;
  }
}

function normalizeTheme(theme) {
  const value = String(theme || "").toLowerCase();
  if (value.includes("blue")) return "blue";
  if (value.includes("gold") || value.includes("yellow")) return "gold";
  if (value.includes("red") || value.includes("rose")) return "rose";
  return "green";
}

function renderOrderReadme({ issueData, brand, audience, offer, cta, contact, txHash, paidAmount }) {
  return [
    `# Paid Order #${issueData.number} - ${escapeMarkdown(brand)}`,
    "",
    `Buyer: @${issueData.user.login}`,
    `Paid: ${paidAmount} USDT`,
    `Transaction: \`${txHash}\``,
    "",
    "## Generated Inputs",
    "",
    `- Brand: ${brand}`,
    `- Audience: ${audience}`,
    `- Offer: ${offer}`,
    `- CTA: ${cta}`,
    `- Contact: ${contact}`,
    "",
    "## Files",
    "",
    "- `index.html`",
    "- `styles.css`",
    "- `script.js`",
    "",
    "Open `index.html`, edit text as needed, and deploy as a static site.",
  ].join("\n");
}

function renderLandingHtml({ brand, audience, offer, cta, contact }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(brand)}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <nav class="nav">
      <strong>${escapeHtml(brand)}</strong>
      <a href="${escapeAttr(contact)}">Contact</a>
    </nav>
    <main>
      <section class="hero">
        <div>
          <p class="eyebrow">Built for ${escapeHtml(audience)}</p>
          <h1>${escapeHtml(offer)}</h1>
          <p class="lead">A focused landing page generated from your paid QuickFix order. Edit this copy, connect your links, and publish anywhere static hosting is supported.</p>
          <a class="button" href="${escapeAttr(contact)}">${escapeHtml(cta)}</a>
        </div>
        <div class="panel">
          <div><strong>Fast</strong><span>Static files, no build step.</span></div>
          <div><strong>Editable</strong><span>Plain HTML, CSS, and JavaScript.</span></div>
          <div><strong>Ready</strong><span>Deploy to GitHub Pages or Netlify.</span></div>
        </div>
      </section>
      <section class="band">
        <h2>Why this works</h2>
        <div class="grid">
          <article><strong>Clear offer</strong><p>Visitors immediately understand what you provide and who it is for.</p></article>
          <article><strong>Simple action</strong><p>One primary button keeps the next step obvious.</p></article>
          <article><strong>Low maintenance</strong><p>No framework or backend is required for launch.</p></article>
        </div>
      </section>
    </main>
    <footer>© <span data-year></span> ${escapeHtml(brand)}</footer>
    <script src="script.js"></script>
  </body>
</html>
`;
}

function renderLandingCss(theme) {
  const palettes = {
    green: ["#102033", "#0f8a62", "#245f99", "#f4f7fb"],
    blue: ["#102033", "#245f99", "#0f8a62", "#f4f7fb"],
    gold: ["#20170a", "#a86d12", "#245f99", "#fff8eb"],
    rose: ["#25111a", "#a83f65", "#245f99", "#fff5f8"],
  };
  const [ink, accent, second, wash] = palettes[theme] || palettes.green;
  return `:root{--ink:${ink};--accent:${accent};--second:${second};--wash:${wash};--line:#d8e2ee;--paper:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--wash)}.nav,.hero,.band,footer{width:min(1080px,calc(100% - 32px));margin:0 auto}.nav{display:flex;align-items:center;justify-content:space-between;min-height:68px}.nav a{color:var(--ink);font-weight:800}.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.75fr);gap:30px;align-items:center;min-height:calc(100vh - 68px);padding:34px 0}.eyebrow{margin:0 0 12px;color:var(--accent);font-size:.88rem;font-weight:850;text-transform:uppercase}h1{margin:0 0 18px;font-size:clamp(2.35rem,7vw,5.4rem);line-height:.98;letter-spacing:0}.lead,p{color:#607084;line-height:1.6}.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;color:#fff;background:var(--accent);border-radius:8px;font-weight:850;text-decoration:none}.panel{display:grid;gap:12px;padding:18px;background:var(--paper);border:1px solid var(--line);border-radius:8px;box-shadow:0 18px 44px rgba(17,28,46,.08)}.panel div,.grid article{padding:16px;background:var(--paper);border:1px solid var(--line);border-radius:8px}.panel strong{display:block;font-size:1.25rem}.panel span{color:#607084}.band{padding:38px 0;border-top:1px solid var(--line)}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}footer{padding:30px 0 42px;color:#607084}@media(max-width:820px){.hero,.grid{grid-template-columns:1fr}.hero{min-height:auto}}\n`;
}

async function putDeliveryFile(path, content, message) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const existing = await github(deliveryToken, `/repos/${deliveryRepo}/contents/${encodedPath}`);
  let sha;
  if (existing.status === 200) {
    const payload = await existing.json();
    sha = payload.sha;
  } else if (existing.status !== 404) {
    const text = await existing.text();
    throw new Error(`Could not inspect delivery file ${path}: HTTP ${existing.status} ${text}`);
  }
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
  };
  if (sha) body.sha = sha;
  await githubJson(deliveryToken, `/repos/${deliveryRepo}/contents/${encodedPath}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function escapeAttr(value) {
  const text = String(value || "#").trim();
  if (/^(https?:|mailto:|tel:)/i.test(text)) return escapeHtml(text);
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) return `mailto:${escapeHtml(text)}`;
  return "#";
}

function escapeMarkdown(value) {
  return String(value).replace(/[`*_#[\]]/g, "\\$&");
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
