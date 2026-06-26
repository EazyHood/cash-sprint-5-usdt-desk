const usdtContract = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const defaultWallet = "0x06f44f4839fd5df4f4670036d028b29dec939363";

const form = document.querySelector("#linkForm");
const recipient = document.querySelector("#recipient");
const amount = document.querySelector("#amount");
const buttonLabel = document.querySelector("#buttonLabel");
const note = document.querySelector("#note");
const qr = document.querySelector("#qr");
const deeplinkOutput = document.querySelector("#deeplink");
const snippetOutput = document.querySelector("#snippet");
const copyLink = document.querySelector("#copyLink");
const copySnippet = document.querySelector("#copySnippet");
const openWallet = document.querySelector("#openWallet");

recipient.value = defaultWallet;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  updateOutput();
});

[recipient, amount, buttonLabel, note].forEach((input) => input.addEventListener("input", updateOutput));

copyLink.addEventListener("click", () => copyText(deeplinkOutput.value, copyLink, "Copy link"));
copySnippet.addEventListener("click", () => copyText(snippetOutput.value, copySnippet, "Copy snippet"));

function updateOutput() {
  const wallet = recipient.value.trim();
  const paymentAmount = Math.max(0.01, Number(amount.value || 5));
  const rawAmount = Math.round(paymentAmount * 1_000_000);
  const label = buttonLabel.value.trim() || `Pay ${paymentAmount} USDT`;
  const memo = note.value.trim() || "Send the transaction hash after payment.";
  const deeplink = `ethereum:${usdtContract}/transfer?address=${wallet}&uint256=${rawAmount}`;
  const escapedLink = escapeHtml(deeplink);
  const escapedLabel = escapeHtml(label);
  const escapedMemo = escapeHtml(memo);
  const snippet = [
    `<a href="${escapedLink}" style="display:inline-flex;align-items:center;min-height:42px;padding:0 14px;background:#0f8a5f;color:#fff;border-radius:8px;font-weight:800;text-decoration:none;">${escapedLabel}</a>`,
    `<p style="font:14px system-ui;color:#5b6b7d;">${escapedMemo}</p>`,
  ].join("\n");
  deeplinkOutput.value = deeplink;
  snippetOutput.value = snippet;
  openWallet.href = deeplink;
  qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(deeplink)}`;
}

async function copyText(value, button, resetText) {
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = resetText;
    }, 1600);
  } catch {
    deeplinkOutput.focus();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

updateOutput();
