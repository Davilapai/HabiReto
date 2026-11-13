/**
 * Módulo de Movimientos y Libro Mayor para Vaqui (HabiReto).
 *
 * Implementa el diseño Stitch Terra de `movimientos_libro_mayor_habireto`:
 * - Tres tarjetas de métricas financieras (Saldo Disponible, Entradas/Créditos y Salidas/Débitos).
 * - Barra de herramientas con filtros dinámicos (`Todos`, `Entradas`, `Salidas`), buscador y botón `Actualizar`.
 * - Tabla de Libro Mayor de partida doble con iconos semánticos, referencias `TRX-XXXXXXXX`,
 *   fechas formateadas, montos con signo y saldos resultantes (`balance_after`) auditados.
 */

import { api, formatNumber } from "../api.js";
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
 * Separa una fecha ISO en fecha legible y hora legible en formato colombiano.
 *
 * @param {string} isoString - Cadena ISO-8601 proveniente del backend.
 * @returns {{ datePart: string, timePart: string }} Fecha y hora separadas.
 */
function splitDateTime(isoString) {
  if (!isoString) return { datePart: "Reciente", timePart: "" };
  try {
    const d = new Date(isoString);
    const datePart = new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
    const timePart = new Intl.DateTimeFormat("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
    return { datePart, timePart };
  } catch (_e) {
    return { datePart: String(isoString), timePart: "" };
  }
}

/**
 * Determina el icono Material Symbols y el esquema de color según el concepto y tipo de asiento.
 *
 * @param {Object} entry - Asiento contable del libro mayor.
 * @returns {{ icon: string, boxClass: string }} Icono y clases de contenedor.
 */
function resolveEntryVisual(entry) {
  const isCredit = entry.entry_type === "CREDIT";
  const desc = (entry.description || "").toLowerCase();

  if (desc.includes("vaquita") || desc.includes("vaca") || desc.includes("aporte")) {
    return {
      icon: "savings",
      boxClass: isCredit
        ? "bg-[#f0f7f2] border-[#d3e6d8] text-[#4a7c59]"
        : "bg-[#f5f1ea] border-[#e6e2da] text-[#805236]",
    };
  }
  if (desc.includes("recarga") || desc.includes("pse") || desc.includes("depósito") || desc.includes("deposito")) {
    return {
      icon: "account_balance_wallet",
      boxClass: "bg-[#f0f7f2] border-[#d3e6d8] text-[#4a7c59]",
    };
  }
  return {
    icon: isCredit ? "south_west" : "north_east",
    boxClass: isCredit
      ? "bg-[#f0f7f2] border-[#d3e6d8] text-[#4a7c59]"
      : "bg-[#fdf2f2] border-[#f5d0d0] text-[#b83230]",
  };
}

/**
 * Inicializa el componente de Movimientos (Libro Mayor) en el contenedor DOM.
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

    const creditsList = rawHistory.filter((e) => e.entry_type === "CREDIT");
    const debitsList = rawHistory.filter((e) => e.entry_type === "DEBIT");

    const totalCredits = creditsList.reduce((acc, e) => acc + Number(e.amount || 0), 0);
    const totalDebits = debitsList.reduce((acc, e) => acc + Number(e.amount || 0), 0);

    const filteredHistory = rawHistory.filter((entry) => {
      if (activeFilter !== "ALL" && entry.entry_type !== activeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const refCode = entry.transaction_id
          ? "trx-" + entry.transaction_id.substring(0, 8).toLowerCase()
          : "";
        const descMatch = entry.description && entry.description.toLowerCase().includes(q);
        const refMatch =
          (entry.transaction_id && entry.transaction_id.toLowerCase().includes(q)) ||
          refCode.includes(q);
        return descMatch || refMatch;
      }
      return true;
    });

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Fila de 3 tarjetas de resumen contable -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <!-- Saldo Disponible -->
          <div class="bg-white border border-[#e6e2da] rounded-2xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-[#5e6660]">Saldo Disponible</span>
              <div class="w-8 h-8 rounded-lg bg-[#f5f1ea] flex items-center justify-center text-[#4a7c59]">
                <span class="material-symbols-outlined text-[18px]">account_balance_wallet</span>
              </div>
            </div>
            <div class="flex items-baseline gap-1.5">
              <span class="text-2xl font-extrabold font-headline text-[#171d1a] tracking-tight tabular-nums">$ ${formatNumber(balance)}</span>
              <span class="text-xs font-bold text-[#5e6660]">COP</span>
            </div>
            <div class="mt-3 pt-3 border-t border-[#f5f1ea] flex items-center justify-between text-[11px] text-[#5e6660]">
              <span>Cuenta Vaqui activa y conciliada</span>
              <span class="text-[#4a7c59] font-semibold flex items-center gap-0.5">
                <span class="material-symbols-outlined text-[13px]">verified</span> Al día
              </span>
            </div>
          </div>

          <!-- Entradas (Créditos) -->
          <div class="bg-white border border-[#e6e2da] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-[#5e6660]">Entradas (Créditos)</span>
              <div class="w-8 h-8 rounded-lg bg-[#f0f7f2] flex items-center justify-center text-[#4a7c59]">
                <span class="material-symbols-outlined text-[18px]">arrow_downward</span>
              </div>
            </div>
            <div class="flex items-baseline gap-1.5">
              <span class="text-2xl font-extrabold font-headline text-[#4a7c59] tracking-tight tabular-nums">+$ ${formatNumber(totalCredits)}</span>
              <span class="text-xs font-bold text-[#4a7c59]/80">COP</span>
            </div>
            <div class="mt-3 pt-3 border-t border-[#f5f1ea] flex items-center justify-between text-[11px] text-[#5e6660]">
              <span class="tabular-nums">${creditsList.length} ${creditsList.length === 1 ? "ingreso registrado" : "ingresos registrados"}</span>
              <span class="font-medium text-[#171d1a]">Recargas y abonos</span>
            </div>
          </div>

          <!-- Salidas (Débitos) -->
          <div class="bg-white border border-[#e6e2da] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-[#5e6660]">Salidas (Débitos)</span>
              <div class="w-8 h-8 rounded-lg bg-[#fdf2f2] flex items-center justify-center text-[#b83230]">
                <span class="material-symbols-outlined text-[18px]">arrow_upward</span>
              </div>
            </div>
            <div class="flex items-baseline gap-1.5">
              <span class="text-2xl font-extrabold font-headline text-[#b83230] tracking-tight tabular-nums">-$ ${formatNumber(totalDebits)}</span>
              <span class="text-xs font-bold text-[#b83230]/80">COP</span>
            </div>
            <div class="mt-3 pt-3 border-t border-[#f5f1ea] flex items-center justify-between text-[11px] text-[#5e6660]">
              <span class="tabular-nums">${debitsList.length} ${debitsList.length === 1 ? "salida registrada" : "salidas registradas"}</span>
              <span class="font-medium text-[#171d1a]">Aportes y transferencias</span>
            </div>
          </div>
        </div>

        <!-- Barra de filtros, búsqueda y actualización -->
        <div class="bg-white border border-[#e6e2da] rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
          <!-- Pestañas de filtro -->
          <div class="flex items-center gap-1 bg-[#f5f1ea] p-1 rounded-xl" role="tablist">
            <button
              type="button"
              data-filter="ALL"
              class="history-filter-tab flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all ${
                activeFilter === "ALL"
                  ? "font-bold bg-white text-[#171d1a] shadow-sm border border-[#e6e2da]/60"
                  : "font-semibold text-[#5e6660] hover:text-[#171d1a]"
              }"
            >
              <span>Todos</span>
              <span class="px-1.5 py-0.5 rounded-md ${
                activeFilter === "ALL" ? "bg-[#f5f1ea] text-[#171d1a]" : "bg-[#eae5db]/70 text-[#5e6660]"
              } text-[10px] font-extrabold tabular-nums">${rawHistory.length}</span>
            </button>

            <button
              type="button"
              data-filter="CREDIT"
              class="history-filter-tab flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all ${
                activeFilter === "CREDIT"
                  ? "font-bold bg-white text-[#171d1a] shadow-sm border border-[#e6e2da]/60"
                  : "font-semibold text-[#5e6660] hover:text-[#171d1a]"
              }"
            >
              <span>Entradas</span>
              <span class="px-1.5 py-0.5 rounded-md bg-[#e8f1eb] text-[#4a7c59] text-[10px] font-bold tabular-nums">${creditsList.length}</span>
            </button>

            <button
              type="button"
              data-filter="DEBIT"
              class="history-filter-tab flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all ${
                activeFilter === "DEBIT"
                  ? "font-bold bg-white text-[#171d1a] shadow-sm border border-[#e6e2da]/60"
                  : "font-semibold text-[#5e6660] hover:text-[#171d1a]"
              }"
            >
              <span>Salidas</span>
              <span class="px-1.5 py-0.5 rounded-md bg-[#fdf2f2] text-[#b83230] text-[10px] font-bold tabular-nums">${debitsList.length}</span>
            </button>
          </div>

          <!-- Buscador y botón Actualizar -->
          <div class="flex items-center gap-2.5 flex-1 sm:max-w-md justify-end">
            <div class="relative flex-1">
              <span class="material-symbols-outlined text-[#5e6660] text-[18px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
              <input
                type="text"
                id="historySearchInput"
                value="${searchQuery}"
                placeholder="Buscar por concepto o referencia (ej. TRX-946C)..."
                aria-label="Buscar por concepto o referencia"
                class="w-full pl-9 pr-3 py-1.5 bg-[#f9f8f5] border border-[#e6e2da] rounded-xl text-xs text-[#171d1a] placeholder-[#5e6660]/70 focus:outline-none focus:border-[#4a7c59] focus:bg-white transition-all"
              />
            </div>
            <button
              type="button"
              id="btnRefreshHistory"
              ${isRefreshing ? "disabled" : ""}
              class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#f5f1ea] hover:bg-[#eae5db] text-[#171d1a] font-semibold text-xs border border-[#e6e2da] transition-all shrink-0 disabled:opacity-60"
            >
              <span class="material-symbols-outlined text-[16px] text-[#4a7c59]">sync</span>
              <span>${isRefreshing ? "Actualizando..." : "Actualizar"}</span>
            </button>
          </div>
        </div>

        <!-- Tabla de Libro Mayor de Partida Doble -->
        <div class="bg-white border border-[#e6e2da] rounded-2xl shadow-sm overflow-hidden">
          <div class="px-6 py-4 border-b border-[#e6e2da] flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#fcfbf9]">
            <div>
              <h2 class="text-sm font-bold font-headline text-[#171d1a]">Historial de Partidas Contables</h2>
              <p class="text-xs text-[#5e6660]">Registro auditado en tiempo real con protocolo Zero-Trust y confirmación inmediata</p>
            </div>
            <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#5e6660] bg-[#f5f1ea] px-2.5 py-1 rounded-md border border-[#e6e2da] self-start sm:self-auto">
              <span class="w-1.5 h-1.5 rounded-full bg-[#4a7c59]"></span>
              Libro Mayor • Sincronizado
            </span>
          </div>

          ${
            filteredHistory.length === 0
              ? `
                <div class="p-12 text-center">
                  <div class="w-12 h-12 rounded-2xl bg-[#f5f1ea] text-[#5e6660] flex items-center justify-center mx-auto mb-3">
                    <span class="material-symbols-outlined">receipt_long</span>
                  </div>
                  <p class="text-sm font-bold text-[#171d1a] mb-1">Sin movimientos para mostrar</p>
                  <p class="text-xs text-[#5e6660]">Realiza una recarga o transferencia desde el Panel Principal o ajusta tu filtro de búsqueda.</p>
                </div>
              `
              : `
                <div class="overflow-x-auto">
                  <table class="w-full text-left border-collapse">
                    <thead>
                      <tr class="border-b border-[#e6e2da] bg-[#f5f1ea]/60 text-[11px] font-bold uppercase tracking-wider text-[#5e6660]">
                        <th class="py-3.5 pl-6 pr-4">Concepto y Referencia</th>
                        <th class="py-3.5 px-4">Fecha</th>
                        <th class="py-3.5 px-4 text-right">Monto</th>
                        <th class="py-3.5 pl-4 pr-6 text-right">Saldo Resultante</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-[#e6e2da]/70 text-sm">
                      ${filteredHistory
                        .map((entry) => {
                          const isCredit = entry.entry_type === "CREDIT";
                          const refCode = entry.transaction_id
                            ? "TRX-" + entry.transaction_id.substring(0, 8).toUpperCase()
                            : "TRX-EXT" + (entry.id ? entry.id.substring(0, 5).toUpperCase() : "001");
                          const descriptionText =
                            entry.description ||
                            (isCredit ? "Transferencia recibida" : "Transferencia enviada");
                          const { datePart, timePart } = splitDateTime(entry.created_at);
                          const visual = resolveEntryVisual(entry);

                          return `
                            <tr class="hover:bg-[#f9f8f5] transition-colors group">
                              <td class="py-4 pl-6 pr-4">
                                <div class="flex items-start gap-3.5">
                                  <div class="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${visual.boxClass}">
                                    <span class="material-symbols-outlined text-[18px]">${visual.icon}</span>
                                  </div>
                                  <div>
                                    <p class="font-bold text-[#171d1a] text-sm leading-snug">${descriptionText}</p>
                                    <div class="flex items-center gap-2 mt-1 flex-wrap">
                                      <span class="font-mono text-[11px] font-medium text-[#5e6660] bg-[#f5f1ea] px-1.5 py-0.5 rounded border border-[#e6e2da]/80 tabular-nums">${refCode}</span>
                                      <span class="text-[11px] text-[#5e6660]">• ${isCredit ? "Asiento de crédito" : "Asiento de débito"}</span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td class="py-4 px-4 whitespace-nowrap">
                                <div class="text-xs font-semibold text-[#171d1a] tabular-nums">${datePart}</div>
                                <div class="text-[11px] text-[#5e6660] tabular-nums">${timePart}</div>
                              </td>
                              <td class="py-4 px-4 text-right whitespace-nowrap">
                                <span class="inline-flex items-center gap-1 font-headline font-extrabold ${
                                  isCredit ? "text-[#4a7c59]" : "text-[#b83230]"
                                } text-sm tabular-nums">
                                  ${isCredit ? "+" : "-"}$ ${formatNumber(entry.amount)}
                                </span>
                                <div class="text-[10px] font-bold uppercase tracking-wider ${
                                  isCredit ? "text-[#4a7c59]/80" : "text-[#b83230]/75"
                                }">${isCredit ? "Crédito" : "Débito"}</div>
                              </td>
                              <td class="py-4 pl-4 pr-6 text-right whitespace-nowrap">
                                <span class="font-headline font-bold text-[#171d1a] text-sm tabular-nums">$ ${formatNumber(entry.balance_after)}</span>
                                <div class="text-[10px] text-[#5e6660] font-medium">COP</div>
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

          <!-- Pie de tabla -->
          <div class="px-6 py-3.5 bg-[#fcfbf9] border-t border-[#e6e2da] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#5e6660]">
            <span class="tabular-nums">Mostrando <strong class="text-[#171d1a]">${filteredHistory.length}</strong> de <strong class="text-[#171d1a]">${rawHistory.length}</strong> transacciones registradas</span>
            <div class="flex items-center gap-1.5 text-[11px]">
              <span class="material-symbols-outlined text-[15px] text-[#4a7c59]">lock</span>
              <span>Inmutabilidad garantizada por libro contable append-only</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Botón Actualizar
    const btnRefresh = container.querySelector("#btnRefreshHistory");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", async () => {
        await loadData();
        showToast("Libro Mayor sincronizado", "info", 1500);
      });
    }

    // Pestañas de filtro
    container.querySelectorAll(".history-filter-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFilter = btn.getAttribute("data-filter") || "ALL";
        render(store.getState());
      });
    });

    // Búsqueda reactiva preservando el foco
    const searchInput = container.querySelector("#historySearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        render(store.getState());
        const refreshed = container.querySelector("#historySearchInput");
        if (refreshed) {
          refreshed.focus();
          refreshed.setSelectionRange(searchQuery.length, searchQuery.length);
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
