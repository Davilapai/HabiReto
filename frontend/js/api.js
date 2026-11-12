/**
 * Cliente HTTP para comunicación con el backend FastAPI de HabiReto.
 * 
 * Inyecta sistemáticamente la cabecera X-User-Id del usuario en sesión
 * y genera claves Idempotency-Key Exactly-Once mediante crypto.randomUUID().
 */

import { store } from "./state.js";

const BASE_URL = "/api/v1";

/**
 * Realiza una petición HTTP aplicando cabeceras estándar de autenticación mock e idempotencia.
 */
async function request(endpoint, options = {}) {
  const activeUser = store.getActiveUser();
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    ...(activeUser ? { "X-User-Id": activeUser.id } : {}),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    cache: "no-store",
    headers,
  };

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, config);
    let data = null;

    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const errorMsg = (data && data.detail) || (typeof data === "string" ? data : `Error HTTP ${res.status}`);
      const err = new Error(errorMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    if (!err.status) {
      err.message = `Falla de conectividad: ${err.message || "No fue posible contactar el servidor"}`;
    }
    throw err;
  }
}

export const api = {
  // Usuarios e Identidades
  async listUsers() {
    return await request("/users", { method: "GET" });
  },

  async createUser(data) {
    return await request("/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Consultas y operaciones de Cuentas
  async getBalance(accountId) {
    return await request(`/accounts/${accountId}/balance`, { method: "GET" });
  },

  async getHistory(accountId, limit = 50, offset = 0) {
    return await request(`/accounts/${accountId}/history?limit=${limit}&offset=${offset}`, { method: "GET" });
  },

  async loadBalance(accountId, amount, description = "Recarga rápida") {
    const idempotencyKey = crypto.randomUUID();
    return await request(`/accounts/${accountId}/load`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        amount: Number(amount),
        description,
      }),
    });
  },

  // Transferencias P2P (por llave @ABC123 o cuenta destino)
  async transfer(sourceAccountId, destinationKeyOrAccountId, amount, description = "Transferencia P2P") {
    const idempotencyKey = crypto.randomUUID();
    const target = String(destinationKeyOrAccountId || "").trim();
    const isKey = target.startsWith("@");
    const payload = {
      source_account_id: sourceAccountId,
      amount: Number(amount),
      description,
      ...(isKey
        ? { destination_key: target.toUpperCase() }
        : { destination_account_id: target }),
    };
    return await request("/transfers", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  },

  // Fondos colaborativos (Vaquitas)
  async listCows(status = null) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return await request(`/cows${query}`, { method: "GET" });
  },

  async getCowDetail(cowId) {
    return await request(`/cows/${cowId}`, { method: "GET" });
  },

  async createCow(title, description, targetAmount, visibilityType = "PUBLIC", deadline = null, invitedKeys = []) {
    return await request("/cows", {
      method: "POST",
      body: JSON.stringify({
        title,
        description: description || null,
        target_amount: Number(targetAmount),
        visibility_type: visibilityType,
        deadline: deadline || null,
        invited_keys: invitedKeys || [],
      }),
    });
  },

  async contributeToCow(cowId, amount) {
    const idempotencyKey = crypto.randomUUID();
    return await request(`/cows/${cowId}/contributions`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        amount: Number(amount),
      }),
    });
  },

  async disburseCow(cowId) {
    return await request(`/cows/${cowId}/disburse`, {
      method: "POST",
    });
  },

  async cancelCow(cowId) {
    return await request(`/cows/${cowId}/cancel`, {
      method: "POST",
    });
  },
};

/**
 * Formatea un monto monetario en Pesos Colombianos (COP).
 */
export function formatCOP(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Formatea una marca de tiempo ISO en fecha y hora legible.
 */
export function formatDate(isoDateStr) {
  if (!isoDateStr) return "—";
  const date = new Date(isoDateStr);
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
