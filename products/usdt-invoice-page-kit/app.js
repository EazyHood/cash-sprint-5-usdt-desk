const wallet = "0x06f44f4839fd5df4f4670036d028b29dec939363";
const usdtContract = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const defaultItem = "Quick web fix";
const defaultMemo = "5 USDT quick service payment";

const form = document.querySelector("#invoiceForm");
const amountInput = document.querySelector("#amount");
const itemInput = document.querySelector("#item");
const memoInput = document.querySelector("#memo");
const qr = document.querySelector("#qr");
const invoiceText = document.querySelector("#invoiceText");
const copyInvoice = document.querySelector("#copyInvoice");
const walletLink = document.querySelector("#walletLink");

itemInput.value = defaultItem;
memoInput.value = defaultMemo;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  updateInvoice();
});

[amountInput, itemInput, memoInput].forEach((input) => input.addEventListener("input", updateInvoice));

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

function updateInvoice() {
  const amount = Math.max(5, Number(amountInput.value || 5));
  const rawAmount = Math.round(amount * 1_000_000);
  const item = itemInput.value.trim() || defaultItem;
  const memo = memoInput.value.trim() || item;
  const deeplink = `ethereum:${usdtContract}/transfer?address=${wallet}&uint256=${rawAmount}`;
  walletLink.href = deeplink;
  qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(deeplink)}`;
  invoiceText.value = [
    "USDT invoice",
    `Item: ${item}`,
    `Memo: ${memo}`,
    `Amount: ${amount.toFixed(amount % 1 === 0 ? 0 : 2)} USDT`,
    "Network: Ethereum / ERC-20",
    `Token: ${usdtContract}`,
    `Recipient: ${wallet}`,
    `Wallet deeplink: ${deeplink}`,
  ].join("\n");
}

updateInvoice();
