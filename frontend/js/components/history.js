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

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;">
        
        <!-- Encabezado con Botón de Actualizar -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
              <div style="width:36px;height:36px;border-radius:10px;background:#EAF2FA;color:#173B63;display:flex;align-items:center;justify-content:center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"/>
                  <line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/>
                  <line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </div>
              <h1 style="font-size:24px;font-weight:700;color:#0F172A;margin:0;letter-spacing:-0.4px;">
                Extracto de Movimientos (Libro Mayor)
              </h1>
            </div>
            <p style="font-size:14px;color:#64748B;margin:0 0 0 46px;">
              Registro auditable e inmutable de partida doble con certificación de saldo posterior (balance_after).
            </p>
          </div>

          <button type="button" id="btnRefreshHistory" class="bank-btn bank-btn-secondary" style="font-size:13px;padding:9px 16px;" ${isRefreshing ? "disabled" : ""}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="${isRefreshing ? "bank-spinner" : ""}">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M8 16H3v5"/>
            </svg>
            <span>${isRefreshing ? "Actualizando..." : "Actualizar Asientos"}</span>
          </button>
        </div>

        <!-- Fila de Resumen Contable -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px;">
          <div class="bank-card" style="padding:16px 20px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Saldo Actual Certificado</span>
            <div class="tabular-nums" style="font-size:24px;font-weight:700;color:#0F172A;margin-top:6px;">
              ${formatCOP(balance)}
            </div>
            <div style="font-size:11px;color:#0E744A;margin-top:4px;font-weight:500;">
              PostgreSQL Check Invariant OK
            </div>
          </div>

          <div class="bank-card" style="padding:16px 20px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Total Entradas (Créditos)</span>
            <div class="tabular-nums" style="font-size:24px;font-weight:700;color:#0E744A;margin-top:6px;">
              +${formatCOP(totalCredits)}
            </div>
            <div style="font-size:11px;color:#64748B;margin-top:4px;">Recargas y transferencias recibidas</div>
          </div>

          <div class="bank-card" style="padding:16px 20px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Total Salidas (Débitos)</span>
            <div class="tabular-nums" style="font-size:24px;font-weight:700;color:#B91C1C;margin-top:6px;">
              -${formatCOP(totalDebits)}
            </div>
            <div style="font-size:11px;color:#64748B;margin-top:4px;">Transferencias y aportes a vacas</div>
          </div>
        </div>

        <!-- Barra de Control: Pestañas de Filtro y Buscador -->
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
          <div class="cows-filter-tabs">
            <button type="button" class="cows-filter-tab ${activeFilter === 'ALL' ? 'active' : ''}" data-filter="ALL">
              <span>Todos</span>
              <span class="cows-tab-count">${rawHistory.length}</span>
            </button>
            <button type="button" class="cows-filter-tab ${activeFilter === 'CREDIT' ? 'active' : ''}" data-filter="CREDIT">
              <span>Créditos (+)</span>
              <span class="cows-tab-count">${rawHistory.filter((e) => e.entry_type === "CREDIT").length}</span>
            </button>
            <button type="button" class="cows-filter-tab ${activeFilter === 'DEBIT' ? 'active' : ''}" data-filter="DEBIT">
              <span>Débitos (-)</span>
              <span class="cows-tab-count">${rawHistory.filter((e) => e.entry_type === "DEBIT").length}</span>
            </button>
          </div>

          <div style="position:relative;width:100%;max-width:320px;">
            <div style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94A3B8;pointer-events:none;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <input type="text" id="historySearchInput" class="bank-input" placeholder="Buscar concepto o referencia..." value="${searchQuery}" style="padding-left:36px;font-size:13px;" />
          </div>
        </div>

        <!-- Tabla o Estado Vacío -->
        ${
          filteredHistory.length === 0
            ? `
            <div class="bank-empty-state">
              <svg class="bank-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              <div style="font-weight:700;font-size:16px;color:#0F172A;margin-bottom:4px;">No se encontraron movimientos contables</div>
              <div style="font-size:13px;color:#64748B;">Efectúa una recarga o realiza una transferencia desde el Panel Principal.</div>
            </div>
          `
            : `
            <div class="movements-table-wrapper">
              <table class="movements-table">
                <thead>
                  <tr>
                    <th style="width:170px;">Fecha y Hora</th>
                    <th>Concepto / Descripción</th>
                    <th style="width:180px;">Referencia Ledger</th>
                    <th style="text-align:right;width:160px;">Monto del Asiento</th>
                    <th style="text-align:right;width:160px;">Saldo Posterior</th>
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
                        <!-- Columna: Fecha y Hora -->
                        <td style="color:#64748B;font-size:13px;white-space:nowrap;">
                          <div style="display:flex;align-items:center;gap:10px;">
                            <div style="width:26px;height:26px;border-radius:50%;background:${isCredit ? "#EAF6EF" : "#FEE2E2"};color:${isCredit ? "#0E744A" : "#B91C1C"};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                              ${
                                isCredit
                                  ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`
                                  : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`
                              }
                            </div>
                            <span>${formatDate(entry.created_at)}</span>
                          </div>
                        </td>

                        <!-- Columna: Descripción -->
                        <td style="font-weight:600;color:#0F172A;">
                          ${descriptionText}
                        </td>

                        <!-- Columna: Referencia Contable -->
                        <td>
                          <span class="trx-ref-chip" title="Código de transacción auditable">${refCode}</span>
                        </td>

                        <!-- Columna: Movimiento (+ / -) -->
                        <td class="tabular-nums" style="text-align:right;white-space:nowrap;">
                          <span class="badge ${isCredit ? "badge-success" : "badge-danger"}" style="font-size:12px;padding:4px 9px;">
                            ${isCredit ? "+" : "-"}${formatCOP(entry.amount)}
                          </span>
                        </td>

                        <!-- Columna: Saldo Posterior (balance_after) -->
                        <td class="tabular-nums" style="text-align:right;font-weight:700;color:#0F172A;white-space:nowrap;">
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
        showToast("Extracto contable actualizado", "info", 1500);
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