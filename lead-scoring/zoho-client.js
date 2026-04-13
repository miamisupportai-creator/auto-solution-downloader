/**
 * zoho-client.js
 * ESM Zoho CRM client — zero npm deps, auto token refresh.
 */

import https from "https";

function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

export class ZohoCRMClient {
  constructor() {
    this.domain       = process.env.ZOHO_DOMAIN        || "www.zohoapis.com";
    this.accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN || "accounts.zoho.com";
    this.token        = process.env.ZOHO_ACCESS_TOKEN;
    this.module       = process.env.ZOHO_MODULE        || "Leads";
    this.clientId     = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  }

  // ── token refresh ──────────────────────────────────────────────────────────
  async refreshAccessToken() {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error("Missing ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN");
    }
    const params = new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
    }).toString();

    const res = await httpsRequest({
      hostname: this.accountsDomain,
      path:     `/oauth/v2/token?${params}`,
      method:   "POST",
      headers:  { "Content-Length": 0 },
    });

    if (!res.body.access_token) {
      throw new Error(`Token refresh failed: ${JSON.stringify(res.body)}`);
    }

    this.token = res.body.access_token;
    console.log("  [zoho] token refreshed");
    return this.token;
  }

  // ── core request with auto-retry on 401 ───────────────────────────────────
  async request(path, method = "GET", body = null, retry = true) {
    const options = {
      hostname: this.domain,
      path:     `/crm/v3/${path}`,
      method,
      headers: {
        Authorization:  `Zoho-oauthtoken ${this.token}`,
        "Content-Type": "application/json",
      },
    };

    const res = await httpsRequest(options, body);

    if (res.status === 401 && retry) {
      await this.refreshAccessToken();
      return this.request(path, method, body, false);
    }

    if (res.status >= 400) {
      throw new Error(`Zoho ${method} ${path} → ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
    }

    return res.body;
  }

  // ── CRUD helpers ───────────────────────────────────────────────────────────
  async getRecords(limit = 50, page = 1) {
    return this.request(`${this.module}?per_page=${limit}&page=${page}`);
  }

  async getById(id) {
    return this.request(`${this.module}/${id}`);
  }

  async updateRecord(id, fields) {
    return this.request(`${this.module}/${id}`, "PUT", { data: [fields] });
  }

  async searchByEmail(email) {
    const encoded = encodeURIComponent(email);
    return this.request(`${this.module}/search?criteria=(Email:equals:${encoded})`);
  }

  async upsertRecord(fields) {
    return this.request(`${this.module}/upsert`, "POST", { data: [fields], duplicate_check_fields: ["Email"] });
  }

  async getFields() {
    return this.request(`settings/fields?module=${this.module}`);
  }

  // ── score writeback ────────────────────────────────────────────────────────
  async writeScore(recordId, scoreResult) {
    const fields = {
      Lead_Score__c:     scoreResult.total,
      Lead_Tier__c:      scoreResult.tier,
      Score_Reasoning__c: scoreResult.reasoning?.slice(0, 2000) || "",
    };
    return this.updateRecord(recordId, fields);
  }
}
