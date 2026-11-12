/**
 * Módulo de Extracto de Movimientos y Libro Mayor para HabiReto.
 * 
 * Implementa la visualización del libro mayor de partida doble con:
 * - Resumen contable de Créditos (ingresos) vs Débitos (egresos).
 * - Filtros dinámicos por tipo de asiento y buscador de referencias.
 * - Códigos contables auditables (TRX-XXXX).
 * - Saldos posteriores (balance_after) certificados por PostgreSQL.
 */

import { api, formatCOP, formatDate } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

/**
 * Recarga los asientos contables del usuario activo desde el backend.
 */
export async function reloadHistory() {
  const active = store.getActiveUser();
  if (!active || !active.accountId) return;

  try {
    const histData = await api.getHistory(active.accountId);
    store.setState({ history: histData });
  } catch (err) {
    showToast(err.message, "error");
  }
}

/**
 * Inicializa el componente de Movimientos en el contenedor DOM.
 * 
 * @param {string} containerId - Identificador del contenedor raíz.
 */
export function initHistory(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let isRefreshing = false;
  let activeFilter = "ALL"; // 'ALL' | 'CREDIT' | 'DEBIT'
  let searchQuery = "";

  async function loadData() {
    isRefreshing = true;
    render(store.getState());
    await reloadHistory();
    isRefreshing = false;
    render(store.getState());
  }

  function render(state) {
    const rawHistory = state.history || [];
    const balance = state.balance || 0;

    // Métricas contables
    const totalCredits = rawHistory
      .filter((e) => e.entry_type === "CREDIT")
      .reduce((acc, e) => acc + (e.amount || 0), 0);

    const totalDebits = rawHistory
      .filter((e) => e.entry_type === "DEBIT")
      .reduce((acc, e) => acc + (e.amount || 0), 0);

    // Filtrar por tipo y búsqueda
    const filteredHistory = rawHistory.filter((entry) => {
      if (activeFilter !== "ALL" && entry.entry_type !== activeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const descMatch = entry.description && entry.description.toLowerCase().includes(q);
        const refMatch = entry.transaction_id && entry.transaction_id.toLowerCase().includes(q);
        return descMatch || refMatch;
      }
      return true;
    });

    const countOf = (type) => rawHistory.filter((e) => e.entry_type === type).length;

    // El título de la vista ya vive en la cabecera global; aquí solo resumen,
    // filtros y tabla. La referencia TRX se muestra discreta bajo el concepto.
    container.innerHTML = `
      <div class="page">

        <div class="toolbar">
          <div class="summary-line">
            <div>
              <span class="muted">Saldo</span>
              <span class="summary-value tabular-nums">${formatCOP(balance)}</span>
            </div>
            <div>
              <span class="muted">Entradas</span>
              <span class="summary-value tabular-nums amount-credit">+${formatCOP(totalCredits)}</span>
            </div>
            <div>
              <span class="muted">Salidas</span>
              <span class="summary-value tabular-nums amount-debit">-${formatCOP(totalDebits)}</span>
            </div>
          </div>

          <button type="button" id="btnRefreshHistory" class="bank-btn bank-btn-secondary bank-btn-sm" aria-label="Actualizar movimientos" ${isRefreshing ? "disabled" : ""}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M8 16H3v5"/>
            </svg>
            <span>${isRefreshing ? "Actualizando…" : "Actualizar"}</span>
          </button>
        </div>

        <div class="toolbar">
          <div class="cows-filter-tabs" role="tablist">
            <button type="button" class="cows-filter-tab ${activeFilter === "ALL" ? "active" : ""}" data-filter="ALL">
              Todos <span class="cows-tab-count">${rawHistory.length}</span>
            </button>
            <button type="button" class="cows-filter-tab ${activeFilter === "CREDIT" ? "active" : ""}" data-filter="CREDIT">
              Entradas <span class="cows-tab-count">${countOf("CREDIT")}</span>
            </button>
            <button type="button" class="cows-filter-tab ${activeFilter === "DEBIT" ? "active" : ""}" data-filter="DEBIT">
              Salidas <span class="cows-tab-count">${countOf("DEBIT")}</span>
            </button>
          </div>

          <input type="search" id="historySearchInput" class="bank-input search-input" placeholder="Buscar" aria-label="Buscar por concepto o referencia" value="${searchQuery}" />
        </div>

        ${
          filteredHistory.length === 0
            ? `
            <div class="bank-empty-state">
              <div style="font-weight:600;font-size:15px;color:#0F172A;margin-bottom:4px;">Sin movimientos</div>
              <div class="muted">Haz una recarga o transferencia desde Inicio.</div>
            </div>
          `
            : `
            <div class="movements-table-wrapper">
              <table class="movements-table">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th style="width:180px;">Fecha</th>
                    <th style="text-align:right;width:150px;">Monto</th>
                    <th style="text-align:right;width:150px;">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredHistory
                    .map((entry) => {
                      const isCredit = entry.entry_type === "CREDIT";
                      const refCode = entry.transaction_id
                        ? "TRX-" + entry.transaction_id.substring(0, 8).toUpperCase()
                        : "TRX-EXT" + (entry.id ? entry.id.substring(0, 6).toUpperCase() : "001");

                      const descriptionText =
                        entry.description ||
                        (isCredit ? "Transferencia recibida" : "Transferencia enviada");

                      return `
                      <tr>
                        <td>
                          <div style="font-weight:600;color:#0F172A;">${descriptionText}</div>
                          <div class="tabular-nums" style="font-size:12px;color:#64748B;">${refCode}</div>
                        </td>
                        <td class="muted" style="white-space:nowrap;">${formatDate(entry.created_at)}</td>
                        <td class="tabular-nums ${isCredit ? "amount-credit" : "amount-debit"}" style="text-align:right;white-space:nowrap;font-weight:600;">
                          ${isCredit ? "+" : "-"}${formatCOP(entry.amount)}
                        </td>
                        <td class="tabular-nums" style="text-align:right;white-space:nowrap;color:#0F172A;">
                          ${formatCOP(entry.balance_after)}
                        </td>
                      </tr>
                    `;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
          `
        }

      </div>
    `;

    // Manejador del botón de refresco
    const btnRefresh = container.querySelector("#btnRefreshHistory");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", async () => {
        await loadData();
        showToast("Movimientos actualizados", "info", 1500);
      });
    }

    // Filtros de tabla
    container.querySelectorAll(".cows-filter-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFilter = btn.getAttribute("data-filter");
        render(store.getState());
      });
    });

    // Búsqueda en vivo
    const searchInput = container.querySelector("#historySearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        render(store.getState());
        const refreshedInput = container.querySelector("#historySearchInput");
        if (refreshedInput) {
          refreshedInput.focus();
          refreshedInput.setSelectionRange(searchQuery.length, searchQuery.length);
        }
      });
    }
  }

  let currentUserId = store.getActiveUser()?.id;
  loadData();
  render(store.getState());

  store.subscribe((state) => {
    const newUserId = state.activeUser?.id;
    if (newUserId && newUserId !== currentUserId) {
      currentUserId = newUserId;
      loadData();
    } else {
      render(state);
    }
  });
}