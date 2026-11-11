/**
 * Módulo de Extracto de Movimientos y Libro Mayor para HabiReto.
 * 
 * Implementa la visualización dedicada del libro mayor de partida doble con:
 * - Cabecera corporativa de alto contraste con fondo suave (#EAF2FA).
 * - Distintivos semánticos de movimiento (Crédito verde ↓ y Débito rojo ↑).
 * - Código de referencia transaccional auditable (TRX-XXXX).
 * - Saldo posterior (balance_after) matemáticamente certificado por PostgreSQL.
 * - Soporte para actualización manual y reactividad automática con el estado global.
 */

import { api, formatCOP, formatDate } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

/**
 * Recarga los movimientos contables del usuario activo desde el backend.
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
 * @param {string} containerId - Identificador del nodo contenedor raíz.
 */
export function initHistory(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let isRefreshing = false;

  async function loadData() {
    isRefreshing = true;
    render(store.getState());
    await reloadHistory();
    isRefreshing = false;
    render(store.getState());
  }

  function render(state) {
    const history = state.history || [];

    container.innerHTML = `
      <div class="bank-card" style="padding:24px;">
        
        <!-- Encabezado del Extracto con Botón de Actualizar -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
              <div style="width:32px;height:32px;border-radius:8px;background:#EAF2FA;color:#173B63;display:flex;align-items:center;justify-content:center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"/>
                  <line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/>
                  <line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </div>
              <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0;">
                Extracto de Movimientos (Libro Mayor)
              </h2>
            </div>
            <p style="font-size:13px;color:#64748B;margin:0 0 0 42px;">
              Registro auditable con saldos posteriores (balance_after)
            </p>
          </div>

          <button type="button" id="btnRefreshHistory" class="bank-btn bank-btn-secondary" style="font-size:13px;padding:8px 14px;border-radius:8px;font-weight:500;" ${isRefreshing ? "disabled" : ""}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${isRefreshing ? "bank-spinner" : ""}">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M8 16H3v5"/>
            </svg>
            <span>${isRefreshing ? "Actualizando..." : "Actualizar"}</span>
          </button>
        </div>

        <!-- Tabla o Estado Vacío -->
        ${
          history.length === 0
            ? `
            <div class="bank-empty-state">
              <svg class="bank-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              <div style="font-weight:600;font-size:15px;color:#111827;margin-bottom:4px;">No hay movimientos registrados</div>
              <div style="font-size:13px;color:#64748B;">Realiza una recarga o transferencia para consultar los asientos del libro mayor.</div>
            </div>
          `
            : `
            <div class="movements-table-wrapper">
              <table class="movements-table">
                <thead>
                  <tr>
                    <th style="width:160px;">Fecha</th>
                    <th>Descripción</th>
                    <th style="width:180px;">Referencia</th>
                    <th style="text-align:right;width:150px;">Movimiento</th>
                    <th style="text-align:right;width:150px;">Saldo</th>
                    <th style="width:40px;text-align:center;"></th>
                  </tr>
                </thead>
                <tbody>
                  ${history
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
                          <div style="display:flex;align-items:center;gap:8px;">
                            <div style="width:24px;height:24px;border-radius:50%;background:${isCredit ? "#EAF6EF" : "#FCEEEE"};color:${isCredit ? "#16865B" : "#C2413B"};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
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
                        <td style="font-weight:500;color:#1E293B;">
                          ${descriptionText}
                        </td>

                        <!-- Columna: Referencia Contable -->
                        <td style="color:#64748B;font-family:monospace;font-size:12px;">
                          ${refCode}
                        </td>

                        <!-- Columna: Movimiento (+ / -) -->
                        <td class="tabular-nums" style="text-align:right;white-space:nowrap;">
                          <span class="badge ${isCredit ? "badge-success" : "badge-danger"}" style="font-weight:600;font-size:12px;padding:4px 8px;">
                            ${isCredit ? "+" : "-"}${formatCOP(entry.amount)}
                          </span>
                        </td>

                        <!-- Columna: Saldo Posterior (balance_after) -->
                        <td class="tabular-nums" style="text-align:right;font-weight:600;color:#0F172A;white-space:nowrap;">
                          ${formatCOP(entry.balance_after)}
                        </td>

                        <!-- Columna: Opciones (Tres Puntos) -->
                        <td style="text-align:center;color:#94A3B8;">
                          <span style="cursor:pointer;font-size:16px;line-height:1;" title="Detalles del asiento">⋮</span>
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
  }

  // Carga inicial y suscripción a cambios del usuario activo
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
