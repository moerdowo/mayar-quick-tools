const API_BASE = "https://api.mayar.id/hl/v1";

async function getSettings() {
  const stored = await chrome.storage.sync.get(["apiKey", "redirectUrl"]);
  return {
    apiKey: stored.apiKey || "",
    redirectUrl: stored.redirectUrl || "https://mayar.id/",
  };
}

async function callApi(path, { method = "POST", body, query } = {}) {
  const { apiKey } = await getSettings();
  if (!apiKey) {
    const err = new Error(
      "API key is missing. Open the extension Options to add it."
    );
    err.code = "NO_API_KEY";
    throw err;
  }

  let url = `${API_BASE}${path}`;
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
    );
    url += (url.includes("?") ? "&" : "?") + qs.toString();
  }

  const init = {
    method,
    headers: { Authorization: `Bearer ${apiKey}` },
  };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status}: response was not JSON`);
  }

  if (!res.ok || (payload && payload.statusCode && payload.statusCode >= 400)) {
    const msg =
      (payload && (payload.messages || payload.message)) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return payload;
}

export const MayarApi = {
  async createDynamicQr(amount) {
    return callApi("/qrcode/create", { body: { amount } });
  },

  async createPaymentRequest({
    name,
    email,
    amount,
    mobile,
    description,
    expiredAt,
  }) {
    const { redirectUrl } = await getSettings();
    return callApi("/payment/create", {
      body: {
        name,
        email,
        amount,
        mobile,
        redirectUrl,
        description: description || "Payment request",
        expiredAt,
      },
    });
  },

  async createInvoice({
    name,
    email,
    mobile,
    description,
    expiredAt,
    items,
  }) {
    const { redirectUrl } = await getSettings();
    return callApi("/invoice/create", {
      body: {
        name,
        email,
        mobile,
        redirectUrl,
        description: description || "Invoice",
        expiredAt,
        items,
      },
    });
  },

  async getBalance() {
    return callApi("/balance", { method: "GET" });
  },

  async getPaidTransactions({ page = 1, pageSize = 10 } = {}) {
    return callApi("/transactions", {
      method: "GET",
      query: { page, pageSize },
    });
  },
};
