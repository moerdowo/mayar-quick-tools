import { MayarApi } from "../lib/api.js";
import { applyTheme } from "../lib/theme.js";

applyTheme();

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const fmtIDR = (n) =>
  "Rp " + (Number(n) || 0).toLocaleString("id-ID");

const showToast = (msg, kind = "") => {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast " + kind;
  el.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add("hidden"), 2400);
};

const setLoading = (on) => $("#loader").classList.toggle("hidden", !on);

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard", "ok");
  } catch {
    showToast("Could not copy", "error");
  }
}

/* ---------------- Tabs ---------------- */
$$(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.tab;
    $$(".tab").forEach((t) => t.classList.toggle("active", t === btn));
    $$(".tab-panel").forEach((p) =>
      p.classList.toggle("active", p.id === `tab-${id}`)
    );
    if (id === "tx") openTransactionsTab();
  });
});

$("#open-options").addEventListener("click", () =>
  chrome.runtime.openOptionsPage()
);

/* ---------------- API key banner ---------------- */
async function checkApiKey() {
  const { apiKey } = await chrome.storage.sync.get(["apiKey"]);
  $("#no-key-banner").classList.toggle("hidden", !!apiKey);
}
$("#open-options-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
checkApiKey();

/* ---------------- Dashboard button ---------------- */
$("#brand-dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://web.mayar.id/" });
});

/* ===================== QRIS calculator ===================== */
const calcState = { value: "0" };
const calcDisplay = $("#calc-amount");

function renderCalc() {
  const n = Number(calcState.value);
  calcDisplay.textContent = (n || 0).toLocaleString("id-ID");
}

function pushDigit(d) {
  if (calcState.value === "0") calcState.value = "";
  // cap to a sane length
  if (calcState.value.length + d.length > 12) return;
  calcState.value += d;
  renderCalc();
}

$$(".calc .key").forEach((btn) => {
  btn.addEventListener("click", () => {
    const k = btn.dataset.key;
    if (k === "AC") {
      calcState.value = "0";
      renderCalc();
      return;
    }
    if (k === "DEL") {
      calcState.value = calcState.value.slice(0, -1) || "0";
      renderCalc();
      return;
    }
    if (/^\d+$/.test(k)) pushDigit(k);
  });
});

$("#key-generate").addEventListener("click", generateQris);

// keyboard support inside QRIS tab
document.addEventListener("keydown", (e) => {
  if (!$("#tab-qris").classList.contains("active")) return;
  if (document.activeElement && document.activeElement.tagName === "INPUT")
    return;
  if (/^[0-9]$/.test(e.key)) pushDigit(e.key);
  else if (e.key === "Backspace") {
    calcState.value = calcState.value.slice(0, -1) || "0";
    renderCalc();
  } else if (e.key === "Enter") generateQris();
  else if (e.key === "Escape") {
    calcState.value = "0";
    renderCalc();
  }
});

let lastQrUrl = null;
let lastQrAmount = 0;

async function generateQris() {
  const amount = Number(calcState.value);
  if (!amount || amount < 1) {
    showToast("Enter an amount first", "error");
    return;
  }
  setLoading(true);
  try {
    const res = await MayarApi.createDynamicQr(amount);
    const url = res?.data?.url;
    if (!url) throw new Error("No QR URL returned");
    lastQrUrl = url;
    lastQrAmount = amount;
    $("#qris-image").src = url;
    $("#qris-amount-label").textContent = fmtIDR(amount);
    $("#qris-input").classList.add("hidden");
    $("#qris-result").classList.remove("hidden");
  } catch (err) {
    showToast(err.message || "Failed to create QR", "error");
  } finally {
    setLoading(false);
  }
}

$("#qris-new").addEventListener("click", () => {
  calcState.value = "0";
  renderCalc();
  $("#qris-result").classList.add("hidden");
  $("#qris-input").classList.remove("hidden");
});

$("#qris-download").addEventListener("click", () => {
  if (!lastQrUrl) return;
  const filename = `mayar-qris-${lastQrAmount}-${Date.now()}.png`;
  chrome.downloads.download(
    { url: lastQrUrl, filename, saveAs: true },
    () => {
      if (chrome.runtime.lastError) {
        showToast(chrome.runtime.lastError.message, "error");
      }
    }
  );
});

$("#qris-copy-url").addEventListener("click", () => {
  if (lastQrUrl) copyText(lastQrUrl);
});

renderCalc();

/* ===================== Payment Request ===================== */
const paymentForm = $("#payment-form");

paymentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(paymentForm).entries());
  if (!paymentForm.reportValidity()) return;

  const amount = Number(data.amount);
  if (!amount || amount < 1) {
    showToast("Amount must be greater than 0", "error");
    return;
  }

  const expiredAt = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000
  ).toISOString();

  setLoading(true);
  try {
    const res = await MayarApi.createPaymentRequest({
      name: data.name.trim(),
      email: data.email.trim(),
      mobile: data.mobile.trim(),
      amount,
      description: (data.description || "").trim(),
      expiredAt,
    });
    const link = res?.data?.link;
    if (!link) throw new Error("No payment link returned");
    $("#payment-link").value = link;
    paymentForm.classList.add("hidden");
    $("#payment-result").classList.remove("hidden");
  } catch (err) {
    showToast(err.message || "Failed to create payment request", "error");
  } finally {
    setLoading(false);
  }
});

$("#payment-copy").addEventListener("click", () =>
  copyText($("#payment-link").value)
);
$("#payment-open").addEventListener("click", () => {
  const link = $("#payment-link").value;
  if (link) chrome.tabs.create({ url: link });
});
$("#payment-new").addEventListener("click", () => {
  paymentForm.reset();
  paymentForm.classList.remove("hidden");
  $("#payment-result").classList.add("hidden");
});

/* ===================== Invoice ===================== */
const invoiceForm = $("#invoice-form");
const itemsContainer = $("#invoice-items");
const itemTemplate = $("#invoice-item-template");

function addItemRow(prefill = {}) {
  const node = itemTemplate.content.cloneNode(true);
  const row = node.querySelector(".item-row");
  if (prefill.description)
    row.querySelector(".item-desc").value = prefill.description;
  if (prefill.qty) row.querySelector(".item-qty").value = prefill.qty;
  if (prefill.rate) row.querySelector(".item-rate").value = prefill.rate;

  row.querySelectorAll("input").forEach((i) =>
    i.addEventListener("input", recalcTotal)
  );
  row
    .querySelector(".item-remove")
    .addEventListener("click", () => {
      if (itemsContainer.children.length > 1) {
        row.remove();
        recalcTotal();
      } else {
        showToast("At least one item is required", "error");
      }
    });

  itemsContainer.appendChild(row);
  recalcTotal();
}

function recalcTotal() {
  let total = 0;
  $$(".item-row", itemsContainer).forEach((row) => {
    const qty = Number(row.querySelector(".item-qty").value) || 0;
    const rate = Number(row.querySelector(".item-rate").value) || 0;
    total += qty * rate;
  });
  $("#invoice-total").textContent = fmtIDR(total);
}

$("#invoice-add-item").addEventListener("click", () => addItemRow());

// default: one row + expiry default to +7 days
addItemRow();
(function setDefaultExpiry() {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  // YYYY-MM-DDTHH:mm — local time for the input
  const pad = (n) => String(n).padStart(2, "0");
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  invoiceForm.elements.expiredAt.value = local;
})();

invoiceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!invoiceForm.reportValidity()) return;
  const data = Object.fromEntries(new FormData(invoiceForm).entries());

  const items = $$(".item-row", itemsContainer)
    .map((row) => ({
      description: row.querySelector(".item-desc").value.trim(),
      quantity: Number(row.querySelector(".item-qty").value) || 0,
      rate: Number(row.querySelector(".item-rate").value) || 0,
    }))
    .filter((i) => i.description && i.quantity > 0 && i.rate >= 0);

  if (!items.length) {
    showToast("Add at least one valid item", "error");
    return;
  }

  // datetime-local is interpreted in local time; convert to ISO UTC
  const expiredAt = new Date(data.expiredAt).toISOString();
  if (new Date(expiredAt).getTime() <= Date.now()) {
    showToast("Expiry must be in the future", "error");
    return;
  }

  setLoading(true);
  try {
    const res = await MayarApi.createInvoice({
      name: data.name.trim(),
      email: data.email.trim(),
      mobile: data.mobile.trim(),
      description: (data.description || "").trim(),
      expiredAt,
      items,
    });
    const link = res?.data?.link;
    if (!link) throw new Error("No invoice link returned");
    $("#invoice-link").value = link;
    invoiceForm.classList.add("hidden");
    $("#invoice-result").classList.remove("hidden");
  } catch (err) {
    showToast(err.message || "Failed to create invoice", "error");
  } finally {
    setLoading(false);
  }
});

$("#invoice-copy").addEventListener("click", () =>
  copyText($("#invoice-link").value)
);
$("#invoice-open").addEventListener("click", () => {
  const link = $("#invoice-link").value;
  if (link) chrome.tabs.create({ url: link });
});
$("#invoice-new").addEventListener("click", () => {
  invoiceForm.reset();
  itemsContainer.innerHTML = "";
  addItemRow();
  invoiceForm.classList.remove("hidden");
  $("#invoice-result").classList.add("hidden");
  // re-set default expiry
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  invoiceForm.elements.expiredAt.value =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

/* ===================== Transactions ===================== */
const txList = $("#tx-list");
const txEmpty = $("#tx-empty");
const txError = $("#tx-error");
const txLoadMore = $("#tx-load-more");
const txItemTpl = $("#tx-item-template");
const txState = { page: 1, pageSize: 10, hasMore: false, loaded: false };

function fmtDate(ms) {
  if (!ms) return "";
  const d = new Date(typeof ms === "number" ? ms : Number(ms));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setBalances(data) {
  $("#bal-total").textContent = fmtIDR(data?.balance ?? 0);
  $("#bal-active").textContent = fmtIDR(data?.balanceActive ?? 0);
  $("#bal-pending").textContent = fmtIDR(data?.balancePending ?? 0);
}

function renderTxRow(tx) {
  const node = txItemTpl.content.cloneNode(true);
  const row = node.querySelector(".tx-item");
  const customerName =
    tx?.customer?.name || tx?.customer?.email || "Unknown customer";
  row.querySelector(".tx-customer").textContent = customerName;

  const typeRaw =
    tx?.paymentLink?.name || tx?.balanceHistoryType || tx?.paymentMethod || "—";
  row.querySelector(".tx-type").textContent = String(typeRaw).replace(
    /_/g,
    " "
  );
  row.querySelector(".tx-date").textContent = fmtDate(tx?.createdAt);
  row.querySelector(".tx-amount").textContent = "+ " + fmtIDR(tx?.credit ?? 0);
  return node;
}

function showTxSkeleton(n = 4) {
  txList.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    s.className = "tx-skel";
    txList.appendChild(s);
  }
}

async function loadBalance() {
  try {
    const res = await MayarApi.getBalance();
    setBalances(res?.data || {});
  } catch (err) {
    setBalances({});
    showToast(err.message || "Failed to load balance", "error");
  }
}

async function loadTransactions({ append = false } = {}) {
  txError.classList.add("hidden");
  if (!append) {
    txState.page = 1;
    showTxSkeleton();
    txEmpty.classList.add("hidden");
    txLoadMore.classList.add("hidden");
  }
  try {
    const res = await MayarApi.getPaidTransactions({
      page: txState.page,
      pageSize: txState.pageSize,
    });
    const items = Array.isArray(res?.data) ? res.data : [];
    txState.hasMore = !!res?.hasMore;

    if (!append) txList.innerHTML = "";
    if (items.length === 0 && !append) {
      txEmpty.classList.remove("hidden");
    } else {
      const frag = document.createDocumentFragment();
      items.forEach((tx) => frag.appendChild(renderTxRow(tx)));
      txList.appendChild(frag);
    }
    txLoadMore.classList.toggle("hidden", !txState.hasMore);
  } catch (err) {
    if (!append) txList.innerHTML = "";
    txError.textContent = err.message || "Failed to load transactions";
    txError.classList.remove("hidden");
    txLoadMore.classList.add("hidden");
  }
}

async function openTransactionsTab() {
  const { apiKey } = await chrome.storage.sync.get(["apiKey"]);
  if (!apiKey) {
    setBalances({});
    txList.innerHTML = "";
    txError.textContent =
      "Add an API key in Settings to view balance and transactions.";
    txError.classList.remove("hidden");
    txEmpty.classList.add("hidden");
    txLoadMore.classList.add("hidden");
    return;
  }
  if (!txState.loaded) {
    txState.loaded = true;
    await Promise.all([loadBalance(), loadTransactions()]);
  }
}

$("#tx-refresh").addEventListener("click", async () => {
  await Promise.all([loadBalance(), loadTransactions()]);
});

$("#tx-load-more").addEventListener("click", async () => {
  txState.page += 1;
  await loadTransactions({ append: true });
});
