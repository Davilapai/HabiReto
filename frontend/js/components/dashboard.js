/**
 * Módulo del Panel Principal (Inicio: Recargar y Transferir) para HabiReto / Vaqui.
 *
 * Implementa los diseños de Stitch para el tablero principal en dos columnas:
 * - Columna izquierda (5 cols): Tarjeta de saldo disponible con ocultación de privacidad,
 *   barra de llave única (@ABC123) con copiado al portapapeles y selector de acción principal
 *   entre «Recargar» y «Transferir».
 * - Columna derecha (7 cols): Panel dinámico que alterna entre el formulario de Recargar saldo
 *   y el formulario de Transferir dinero P2P con verificación en vivo del destinatario y
 *   cálculo instantáneo del saldo restante.
 */

import { api, formatCOP } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

/**
 * Sincroniza el saldo contable certificado del usuario activo desde el backend.
 */
export async function reloadDashboard() {
  const active = store.getActiveUser();
  if (!active || !active.accountId) return;

  try {
    const balData = await api.getBalance(active.accountId);
    store.setState({
      balance: balData.balance,
      currency: balData.currency,
      isLoading: false,
    });
  } catch (err) {
    store.setState({ isLoading: false });
    showToast(err.message, "error");
  }
}

/**
 * Inicializa el componente del Panel Principal (Inicio) en el nodo DOM indicado.
 *
 * @param {string} containerId - Identificador del elemento contenedor raíz.
 */
export function initDashboard(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Estado local de interacción de la vista Inicio
  let activeAction = "recharge"; // 'recharge' | 'transfer'
  let selectedMethod = "pse"; // 'pse' | 'card' | 'transfer'
  let isBalanceHidden = false;
  let isSubmittingLoad = false;
  let isSubmittingTransfer = false;

  // Valores preservados entre re-renderizados
  let draftLoadAmount = "50000";
  let draftRecipientKey = "";
  let draftTransferAmount = "";
  let draftTransferMotive = "";

  async function loadData() {
    await reloadDashboard();
  }

  /**
   * Resuelve el usuario registrado correspondiente a una llave @ABC123 si existe en memoria.
   *
   * @param {string} rawKey - Sufijo o llave completa ingresada.
   * @returns {Object|null} Usuario coincidente o null.
   */
  function findRecipientByKey(rawKey) {
    const clean = String(rawKey || "").trim().toUpperCase().replace(/^@/, "");
    if (!clean) return null;
    const fullKey = `@${clean}`;
    const users = store.getUsers() || [];
    return users.find((u) => (u.userKey || "").toUpperCase() === fullKey) || null;
  }

  /**
   * Renderiza la cuadrícula de 12 columnas de Inicio según el estado y la acción seleccionada.
   *
   * @param {Object} state - Estado global de la aplicación.
   */
  function render(state) {
    const active = state.activeUser || {};
    const balance = state.balance || 0;
    const firstName =
      active.shortName ||
      (active.name ? active.name.trim().split(/\s+/)[0] : "Titular");
    const userKey = active.userKey || "@ALI111";

    const otherUsers = (state.users || []).filter((u) => u.id !== active.id);
    const matchedRecipient = findRecipientByKey(draftRecipientKey);

    const parsedTransferAmt = Number(draftTransferAmount) || 0;
    let remainingBadgeHtml = `
      <span>Disponible: <strong class="tabular-nums">${formatCOP(balance)}</strong></span>
    `;
    if (parsedTransferAmt > 0) {
      if (parsedTransferAmt > balance) {
        const excess = parsedTransferAmt - balance;
        remainingBadgeHtml = `
          <span class="text-[#b83230] font-bold tabular-nums">Excede disponible en ${formatCOP(excess)}</span>
        `;
      } else {
        const remaining = balance - parsedTransferAmt;
        remainingBadgeHtml = `
          <span>Disponible: <strong class="tabular-nums">${formatCOP(balance)}</strong></span>
          <span class="text-[#b2bab4] mx-1">•</span>
          <span class="text-[#2e573c] font-bold tabular-nums">Quedan: ${formatCOP(remaining)}</span>
        `;
      }
    }

    container.innerHTML = `
      <div class="flex flex-col w-full">
        <!-- Saludo Principal -->
        <div class="pb-8">
          <h2 class="text-3xl sm:text-4xl font-extrabold text-[#161d19] tracking-tight font-heading m-0">
            ¡Hola ${firstName}!
          </h2>
        </div>

        <!-- Cuadrícula Principal de 12 Columnas -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">

          <!-- ================= COLUMNA IZQUIERDA (5 cols): Saldo y Acción Principal ================= -->
          <div class="lg:col-span-5 bg-white rounded-3xl p-7 border border-[#e8e3da] shadow-sm space-y-6 relative overflow-hidden">
            <div class="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-[#c8e8d0]/25 pointer-events-none blur-2xl"></div>

            <div class="relative z-10 space-y-6">
              <!-- Encabezado de Saldo Disponible -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-lg bg-[#f5f1ea] flex items-center justify-center text-[#4a7c59]">
                      <span class="material-symbols-outlined text-[19px]">account_balance_wallet</span>
                    </div>
                    <span class="text-xs uppercase tracking-wider font-bold text-[#6b6358] font-heading">Saldo disponible</span>
                  </div>
                  <button
                    type="button"
                    id="toggleBalanceBtn"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#f5f1ea] hover:bg-[#eae4dc] text-[#55645a] transition-colors cursor-pointer border-0"
                  >
                    <span class="material-symbols-outlined text-[16px]" id="eyeIcon">${isBalanceHidden ? "visibility_off" : "visibility"}</span>
                    <span id="toggleText">${isBalanceHidden ? "Mostrar" : "Ocultar"}</span>
                  </button>
                </div>

                <!-- Monto Destacado con Insignia COP -->
                <div class="flex items-baseline gap-3 my-3">
                  <span id="balanceDisplay" class="text-4xl sm:text-5xl font-extrabold font-heading text-[#161d19] tracking-tight tabular-nums">
                    ${isBalanceHidden ? "$ ••••••••" : formatCOP(balance)}
                  </span>
                  <span class="px-2.5 py-0.5 rounded-md bg-[#c8e8d0] text-[#20462c] text-xs font-extrabold font-heading uppercase tracking-wider">
                    COP
                  </span>
                </div>

                <!-- Barra de Llave Única -->
                <div class="mt-4 flex items-center justify-between p-3 rounded-2xl bg-[#f5f1ea] border border-[#e8e3da]/80 text-xs">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="material-symbols-outlined text-[17px] text-[#4a7c59] shrink-0">key</span>
                    <div class="truncate">
                      <span class="font-mono font-bold text-[#191c1d] tabular-nums">${userKey}</span>
                      <span class="text-[#6b6358] font-medium"> • Cuenta Vaqui activa</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    id="copyAccBtn"
                    class="ml-2 inline-flex items-center gap-1 font-bold font-heading text-[#4a7c59] hover:text-[#20462c] shrink-0 transition-colors cursor-pointer bg-transparent border-0"
                  >
                    <span class="material-symbols-outlined text-[15px]">content_copy</span>
                    <span id="copyAccText">Copiar llave</span>
                  </button>
                </div>
              </div>

              <div class="h-px bg-[#eae6de] w-full"></div>

              <!-- Selector de Acción Principal (Recargar vs Transferir) -->
              <div>
                <span class="text-[11px] font-bold tracking-wider font-heading uppercase text-[#6b6358] block mb-3">
                  Acción principal
                </span>
                <div class="grid grid-cols-2 gap-3">
                  <!-- Botón 1: Recargar -->
                  <button
                    type="button"
                    id="btnSwitchActionRecharge"
                    class="relative flex flex-col items-center justify-center p-4 rounded-2xl transition-all cursor-pointer border ${
                      activeAction === "recharge"
                        ? "bg-[#4a7c59] text-white border-[#3f6d4d] shadow-md shadow-[#4a7c59]/25 ring-4 ring-[#4a7c59]/10"
                        : "bg-[#f5f1ea] hover:bg-[#ece6dc] text-[#3e4c42] border-transparent hover:border-[#ded6c9]"
                    }"
                  >
                    <div class="w-10 h-10 rounded-full ${
                      activeAction === "recharge"
                        ? "bg-white/20 text-white"
                        : "bg-white text-[#526357] shadow-sm"
                    } flex items-center justify-center mb-2">
                      <span class="material-symbols-outlined text-xl">add_circle</span>
                    </div>
                    <span class="text-xs font-extrabold font-heading tracking-wide">Recargar</span>
                    ${
                      activeAction === "recharge"
                        ? `<span class="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-emerald-200"></span>`
                        : ""
                    }
                  </button>

                  <!-- Botón 2: Transferir -->
                  <button
                    type="button"
                    id="btnSwitchActionTransfer"
                    class="relative flex flex-col items-center justify-center p-4 rounded-2xl transition-all cursor-pointer border ${
                      activeAction === "transfer"
                        ? "bg-[#4a7c59] text-white border-[#3f6d4d] shadow-md shadow-[#4a7c59]/25 ring-4 ring-[#4a7c59]/10"
                        : "bg-[#f5f1ea] hover:bg-[#ece6dc] text-[#3e4c42] border-transparent hover:border-[#ded6c9]"
                    }"
                  >
                    <div class="w-10 h-10 rounded-full ${
                      activeAction === "transfer"
                        ? "bg-white/20 text-white"
                        : "bg-white text-[#526357] shadow-sm"
                    } flex items-center justify-center mb-2">
                      <span class="material-symbols-outlined text-xl">send</span>
                    </div>
                    <span class="text-xs font-extrabold font-heading tracking-wide">Transferir</span>
                    ${
                      activeAction === "transfer"
                        ? `<span class="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-emerald-200"></span>`
                        : ""
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- ================= COLUMNA DERECHA (7 cols): Panel de Acción Activa ================= -->
          <div class="lg:col-span-7">
            ${
              activeAction === "recharge"
                ? renderRechargePanel()
                : renderTransferPanel(balance, matchedRecipient, otherUsers, remainingBadgeHtml)
            }
          </div>

        </div>
      </div>
    `;

    bindEvents(state);
  }

  /**
   * Renderiza el panel derecho para Recargar saldo (Diseño Stitch: inicio_recargar_habireto).
   */
  function renderRechargePanel() {
    const methods = [
      { id: "pse", label: "PSE", sub: "Débito bancario", icon: "account_balance" },
      { id: "card", label: "Tarjeta", sub: "Débito o crédito", icon: "credit_card" },
      { id: "transfer", label: "Bre-B", sub: "Llave interoperable", icon: "bolt" },
    ];

    return `
      <div class="bg-white rounded-3xl p-7 sm:p-8 border border-[#e8e3da] shadow-sm flex flex-col gap-6">
        <!-- Encabezado del Panel -->
        <div class="flex items-center justify-between pb-4 border-b border-[#f0ece4]">
          <h3 class="text-2xl font-extrabold text-[#161d19] tracking-tight font-heading m-0">
            Recargar saldo
          </h3>
          <div class="w-10 h-10 rounded-2xl bg-[#e8f1eb] flex items-center justify-center text-[#4a7c59] shrink-0">
            <span class="material-symbols-outlined text-[22px]">bolt</span>
          </div>
        </div>

        <form id="loadBalanceForm" class="space-y-6">
          <!-- 1. Método de recarga simulada -->
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#6b6358] font-heading block mb-2.5">
              Canal de recarga
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              ${methods
                .map(
                  (m) => `
                  <button
                    type="button"
                    data-method="${m.id}"
                    class="method-card flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedMethod === m.id
                        ? "border-[#4a7c59] bg-[#e8f1eb]/60 text-[#191c1d] shadow-xs"
                        : "border-[#eae5db] bg-[#f5f1ea]/60 hover:bg-[#f5f1ea] text-[#5d645e]"
                    }"
                  >
                    <div class="w-9 h-9 rounded-xl ${
                      selectedMethod === m.id ? "bg-[#4a7c59] text-white" : "bg-white text-[#4a7c59]"
                    } flex items-center justify-center shrink-0">
                      <span class="material-symbols-outlined text-[19px]">${m.icon}</span>
                    </div>
                    <div class="min-w-0">
                      <div class="text-xs font-extrabold font-heading text-[#191c1d]">${m.label}</div>
                      <div class="text-[11px] text-[#5d645e] truncate">${m.sub}</div>
                    </div>
                  </button>
                `
                )
                .join("")}
            </div>
          </div>

          <!-- 2. Monto a Recargar -->
          <div class="space-y-2.5">
            <label class="text-[11px] font-bold uppercase tracking-wider text-[#6b6358] font-heading block" for="loadAmountInput">
              Monto a recargar
            </label>
            <div class="relative flex items-center rounded-2xl bg-[#f5f1ea] border border-[#e5dfd3] focus-within:border-[#4a7c59] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#4a7c59]/20 transition-all">
              <span class="absolute left-4 font-heading text-2xl font-bold text-[#4a7c59] select-none">$</span>
              <input
                id="loadAmountInput"
                type="number"
                min="1"
                step="any"
                value="${draftLoadAmount}"
                placeholder="50000"
                required
                class="w-full bg-transparent border-0 py-4 pl-10 pr-16 font-heading text-2xl sm:text-3xl font-extrabold text-[#161d19] placeholder:text-[#636a64]/40 focus:outline-none tabular-nums"
              />
              <span class="absolute right-4 text-xs font-extrabold text-[#6b6358] tracking-wider font-mono bg-white/80 px-2.5 py-1 rounded-lg border border-[#ded7cb]">
                COP
              </span>
            </div>

            <!-- Botones de montos sugeridos -->
            <div class="flex items-center gap-2 flex-wrap pt-1">
              ${[20000, 50000, 100000, 200000]
                .map(
                  (amt) => `
                  <button
                    type="button"
                    data-fast-load="${amt}"
                    class="px-3 py-1.5 rounded-xl bg-[#f5f1ea] hover:bg-[#e8f1eb] text-[#191c1d] hover:text-[#20462c] border border-[#eae5db] text-xs font-bold font-heading tabular-nums transition-colors cursor-pointer"
                  >
                    +${formatCOP(amt)}
                  </button>
                `
                )
                .join("")}
            </div>
          </div>

          <!-- Botón CTA Principal -->
          <div class="pt-1">
            <button
              type="submit"
              id="btnSubmitLoad"
              ${isSubmittingLoad ? "disabled" : ""}
              class="w-full py-4 px-6 rounded-2xl bg-[#4a7c59] hover:bg-[#3d6749] active:scale-[0.99] text-white font-heading font-bold text-base shadow-md shadow-[#4a7c59]/20 transition-all flex items-center justify-center gap-2 group cursor-pointer border-0"
            >
              ${
                isSubmittingLoad
                  ? `<span class="bank-spinner"></span><span>Acreditando fondos…</span>`
                  : `<span id="btnText">Continuar</span><span class="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform">arrow_forward</span>`
              }
            </button>
          </div>
        </form>
      </div>
    `;
  }

  /**
   * Renderiza el panel derecho para Transferir dinero (Diseño Stitch: inicio_transferir_habireto).
   */
  function renderTransferPanel(balance, matchedRecipient, otherUsers, remainingBadgeHtml) {
    const cleanKeyVal = String(draftRecipientKey || "").replace(/^@/, "");

    return `
      <div class="bg-white rounded-3xl p-7 sm:p-8 border border-[#e8e3da] shadow-sm space-y-6">
        <!-- Encabezado del Panel -->
        <div class="flex items-center justify-between pb-4 border-b border-[#f0ece4]">
          <h3 class="text-2xl font-extrabold font-heading text-[#161d19] m-0">
            Transferir dinero
          </h3>
          <div class="w-10 h-10 rounded-2xl bg-[#e8f1eb] text-[#4a7c59] flex items-center justify-center shadow-sm">
            <span class="material-symbols-outlined text-xl">send</span>
          </div>
        </div>

        <form id="transferForm" class="space-y-6">
          <!-- Campo 1: Llave del Destinatario -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-[11px] font-bold tracking-wider font-heading uppercase text-[#67776d] flex items-center gap-1.5" for="transferRecipientKey">
                <span class="material-symbols-outlined text-sm text-[#4a7c59]">alternate_email</span>
                Llave del destinatario
              </label>
              <span class="text-[11px] font-bold font-heading text-[#4a7c59]">Contactos frecuentes</span>
            </div>

            <div class="relative flex items-center rounded-2xl bg-[#f5f1ea] border border-[#e5dfd3] focus-within:border-[#4a7c59] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#4a7c59]/20 transition-all">
              <div class="pl-4 pr-1 text-[#4a7c59] font-mono font-bold text-lg select-none">@</div>
              <input
                id="transferRecipientKey"
                type="text"
                maxlength="7"
                value="${cleanKeyVal}"
                placeholder="BOB222"
                required
                class="w-full bg-transparent border-0 py-4 pl-0 pr-4 text-lg font-bold font-mono text-[#1a201c] focus:outline-none focus:ring-0 placeholder-[#9aa69e] uppercase tabular-nums"
              />
              <div id="recipientMatchBadge" class="pr-4 flex items-center gap-1.5 shrink-0">
                ${
                  matchedRecipient
                    ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#e8f1eb] text-[#2c5339]">
                        <span class="material-symbols-outlined text-xs filled text-[#4a7c59]">check_circle</span>
                        ${matchedRecipient.name}
                      </span>`
                    : ""
                }
              </div>
            </div>

            <!-- Contactos frecuentes en 1 clic -->
            ${
              otherUsers.length > 0
                ? `<div class="flex items-center gap-2 flex-wrap mt-2.5">
                    ${otherUsers
                      .map((u) => {
                        const uKey = (u.userKey || "").replace(/^@/, "");
                        return `
                          <button
                            type="button"
                            data-contact-key="${uKey}"
                            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#f5f1ea] hover:bg-[#e8f1eb] border border-[#eae5db] text-xs font-semibold text-[#191c1d] transition-colors cursor-pointer"
                          >
                            <span class="font-mono font-bold text-[#4a7c59] tabular-nums">@${uKey}</span>
                            <span class="text-[#5d645e]">· ${u.shortName || u.name}</span>
                          </button>
                        `;
                      })
                      .join("")}
                  </div>`
                : ""
            }
          </div>

          <!-- Campo 2: Monto a Transferir -->
          <div>
            <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label class="text-[11px] font-bold tracking-wider font-heading uppercase text-[#67776d] flex items-center gap-1.5" for="transferAmount">
                <span class="material-symbols-outlined text-sm text-[#4a7c59]">payments</span>
                Monto a transferir
              </label>

              <div id="remainingBalanceIndicator" class="px-2.5 py-1 rounded-full bg-[#f5f1ea] border border-[#e5dfd3] text-[11px] font-medium text-[#445248] tabular-nums">
                ${remainingBadgeHtml}
              </div>
            </div>

            <div class="relative flex items-center justify-between rounded-2xl bg-[#f5f1ea] border border-[#e5dfd3] p-4 focus-within:border-[#4a7c59] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#4a7c59]/20 transition-all">
              <div class="flex items-baseline gap-2 flex-1">
                <span class="text-2xl font-bold font-heading text-[#4a7c59] select-none">$</span>
                <input
                  id="transferAmount"
                  type="number"
                  min="1"
                  step="any"
                  value="${draftTransferAmount}"
                  placeholder="50000"
                  required
                  class="bg-transparent border-0 text-2xl sm:text-3xl font-extrabold font-heading text-[#161d19] focus:outline-none focus:ring-0 w-full tracking-tight tabular-nums"
                />
              </div>
              <span class="text-xs font-extrabold font-mono text-[#6e7d73] uppercase tracking-wider bg-white/80 px-3 py-1.5 rounded-xl border border-[#ded7cb]">
                COP
              </span>
            </div>
          </div>

          <!-- Campo 3: Concepto (Opcional) -->
          <div>
            <label class="text-[11px] font-bold tracking-wider font-heading uppercase text-[#67776d] mb-2 flex items-center gap-1.5" for="transferMotive">
              <span class="material-symbols-outlined text-sm text-[#4a7c59]">description</span>
              Concepto (opcional)
            </label>
            <div class="relative rounded-2xl bg-[#f5f1ea] border border-[#e5dfd3] focus-within:border-[#4a7c59] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#4a7c59]/20 transition-all">
              <input
                id="transferMotive"
                type="text"
                maxlength="100"
                value="${draftTransferMotive}"
                placeholder="Ej. Almuerzo con amigos"
                class="w-full bg-transparent border-0 py-3.5 px-4 text-sm font-medium text-[#1a201c] placeholder-[#8a988f] focus:outline-none focus:ring-0"
              />
            </div>
          </div>

          <!-- Botón CTA Principal -->
          <div class="pt-1">
            <button
              type="submit"
              id="btnSendTransfer"
              ${isSubmittingTransfer ? "disabled" : ""}
              class="w-full py-4 px-6 rounded-2xl bg-[#4a7c59] hover:bg-[#3c6748] active:scale-[0.99] text-white font-heading font-bold text-base shadow-lg shadow-[#4a7c59]/25 transition-all flex items-center justify-center gap-2 group cursor-pointer border-0"
            >
              ${
                isSubmittingTransfer
                  ? `<span class="bank-spinner"></span><span>Enviando transferencia…</span>`
                  : `<span>Transferir</span><span class="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>`
              }
            </button>
          </div>
        </form>
      </div>
    `;
  }

  /**
   * Enlaza los eventos interactivos del Panel Principal.
   */
  function bindEvents(state) {
    const active = state.activeUser || {};
    const balance = state.balance || 0;
    const userKey = active.userKey || "@ALI111";

    // Mostrar / Ocultar saldo
    const toggleBalanceBtn = container.querySelector("#toggleBalanceBtn");
    if (toggleBalanceBtn) {
      toggleBalanceBtn.addEventListener("click", () => {
        isBalanceHidden = !isBalanceHidden;
        render(store.getState());
      });
    }

    // Copiar llave única al portapapeles
    const copyAccBtn = container.querySelector("#copyAccBtn");
    const copyAccText = container.querySelector("#copyAccText");
    if (copyAccBtn && copyAccText) {
      copyAccBtn.addEventListener("click", () => {
        navigator.clipboard?.writeText(userKey);
        copyAccText.textContent = "¡Copiada!";
        showToast(`Llave ${userKey} copiada al portapapeles`, "info", 2000);
        setTimeout(() => {
          if (copyAccText) copyAccText.textContent = "Copiar llave";
        }, 2000);
      });
    }

    // Conmutar entre Recargar y Transferir
    const btnRecharge = container.querySelector("#btnSwitchActionRecharge");
    const btnTransfer = container.querySelector("#btnSwitchActionTransfer");
    if (btnRecharge) {
      btnRecharge.addEventListener("click", () => {
        if (activeAction !== "recharge") {
          activeAction = "recharge";
          render(store.getState());
        }
      });
    }
    if (btnTransfer) {
      btnTransfer.addEventListener("click", () => {
        if (activeAction !== "transfer") {
          activeAction = "transfer";
          render(store.getState());
        }
      });
    }

    // Eventos del panel Recargar
    container.querySelectorAll(".method-card").forEach((card) => {
      card.addEventListener("click", () => {
        selectedMethod = card.getAttribute("data-method") || "pse";
        render(store.getState());
      });
    });

    const loadAmountInput = container.querySelector("#loadAmountInput");
    if (loadAmountInput) {
      loadAmountInput.addEventListener("input", (e) => {
        draftLoadAmount = e.target.value;
      });
    }

    container.querySelectorAll("[data-fast-load]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-fast-load") || "50000";
        draftLoadAmount = val;
        if (loadAmountInput) loadAmountInput.value = val;
      });
    });

    const loadForm = container.querySelector("#loadBalanceForm");
    if (loadForm && loadAmountInput) {
      loadForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (isSubmittingLoad) return;

        const amount = Number(loadAmountInput.value);
        if (isNaN(amount) || amount <= 0) {
          showToast("Ingresa un monto válido mayor a 0", "warning");
          return;
        }

        isSubmittingLoad = true;
        render(store.getState());

        try {
          const res = await api.loadBalance(
            active.accountId,
            amount,
            `Recarga +$${amount.toLocaleString("es-CO")}`
          );
          showToast(`Recarga exitosa por ${formatCOP(amount)}`, "success");
          draftLoadAmount = "";
          store.setState({ balance: res.balance });
          const history = await api.getHistory(active.accountId);
          store.setState({ history });
        } catch (err) {
          showToast(err.message, "error");
        } finally {
          isSubmittingLoad = false;
          render(store.getState());
        }
      });
    }

    // Eventos del panel Transferir
    const recipientKeyInput = container.querySelector("#transferRecipientKey");
    const recipientBadge = container.querySelector("#recipientMatchBadge");
    if (recipientKeyInput) {
      recipientKeyInput.addEventListener("input", (e) => {
        draftRecipientKey = e.target.value.replace(/^@/, "").toUpperCase();
        const matched = findRecipientByKey(draftRecipientKey);
        if (recipientBadge) {
          recipientBadge.innerHTML = matched
            ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#e8f1eb] text-[#2c5339]">
                <span class="material-symbols-outlined text-xs filled text-[#4a7c59]">check_circle</span>
                ${matched.name}
              </span>`
            : "";
        }
      });
    }

    container.querySelectorAll("[data-contact-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const keyVal = btn.getAttribute("data-contact-key") || "";
        draftRecipientKey = keyVal;
        render(store.getState());
      });
    });

    const amountInput = container.querySelector("#transferAmount");
    const remainingIndicator = container.querySelector("#remainingBalanceIndicator");
    if (amountInput && remainingIndicator) {
      amountInput.addEventListener("input", (e) => {
        draftTransferAmount = e.target.value;
        const val = Number(e.target.value);
        if (isNaN(val) || val <= 0) {
          remainingIndicator.innerHTML = `<span>Disponible: <strong class="tabular-nums">${formatCOP(balance)}</strong></span>`;
        } else if (val > balance) {
          const diff = val - balance;
          remainingIndicator.innerHTML = `<span class="text-[#b83230] font-bold tabular-nums">Excede disponible en ${formatCOP(diff)}</span>`;
        } else {
          const rest = balance - val;
          remainingIndicator.innerHTML = `
            <span>Disponible: <strong class="tabular-nums">${formatCOP(balance)}</strong></span>
            <span class="text-[#b2bab4] mx-1">•</span>
            <span class="text-[#2e573c] font-bold tabular-nums">Quedan: ${formatCOP(rest)}</span>
          `;
        }
      });
    }

    const motiveInput = container.querySelector("#transferMotive");
    if (motiveInput) {
      motiveInput.addEventListener("input", (e) => {
        draftTransferMotive = e.target.value;
      });
    }

    const transferForm = container.querySelector("#transferForm");
    if (transferForm) {
      transferForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (isSubmittingTransfer) return;

        let destKey = String(recipientKeyInput ? recipientKeyInput.value : draftRecipientKey)
          .trim()
          .toUpperCase();
        if (destKey && !destKey.startsWith("@")) {
          destKey = `@${destKey}`;
        }

        const amount = Number(amountInput ? amountInput.value : draftTransferAmount);
        const motive =
          (motiveInput ? motiveInput.value.trim() : draftTransferMotive.trim()) ||
          "Transferencia P2P";

        if (!/^@[A-Z]{3}[0-9]{3}$/.test(destKey)) {
          showToast(
            "La llave debe iniciar con @ seguida de 3 letras y 3 números (ej. @BOB222)",
            "warning"
          );
          return;
        }

        if (active.userKey && destKey === active.userKey.toUpperCase()) {
          showToast("No puedes transferir a tu propia llave", "warning");
          return;
        }

        if (isNaN(amount) || amount <= 0) {
          showToast("El monto debe ser estrictamente positivo", "warning");
          return;
        }

        if (amount > balance) {
          showToast("Saldo insuficiente para ejecutar la transferencia", "warning");
          return;
        }

        isSubmittingTransfer = true;
        render(store.getState());

        try {
          await api.transfer(active.accountId, destKey, amount, motive);
          showToast(`Transferencia exitosa de ${formatCOP(amount)} a ${destKey}`, "success");

          draftRecipientKey = "";
          draftTransferAmount = "";
          draftTransferMotive = "";
          store.setState({ balance: Math.max(0, balance - amount) });

          const [balData, histData] = await Promise.all([
            api.getBalance(active.accountId),
            api.getHistory(active.accountId),
          ]);
          store.setState({ balance: balData.balance, history: histData });
        } catch (err) {
          showToast(err.message, "error");
        } finally {
          isSubmittingTransfer = false;
          render(store.getState());
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
    }
    render(state);
  });
}
