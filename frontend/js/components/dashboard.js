/**
 * Módulo del Panel Central (Dashboard) para HabiReto.
 * 
 * Implementa de manera enfocada y minimalista:
 * 1. Tarjeta de Saldo Disponible con gradiente azul de alto contraste (#091F38 -> #1A4D8A),
 *    cifras tabulares exactas, identificador de cuenta protegida y titular.
 * 2. Bloque de Recarga Rápida con botones de $50k y $100k y badge de recarga segura.
 * 3. Tarjeta de Transferencias P2P con iconos descriptivos, chips rápidos de monto ($50k, $100k, $200k)
 *    y confirmación inmediata respetando el Libro Mayor de Partida Doble.
 */

import { api, formatCOP } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

/**
 * Recarga los datos financieros esenciales del usuario activo.
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
 * Inicializa el componente del Panel Central en el contenedor DOM especificado.
 * 
 * @param {string} containerId - Identificador del nodo contenedor raíz.
 */
export function initDashboard(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let isSubmittingTransfer = false;
  let isSubmittingLoad = false;

  async function loadData() {
    await reloadDashboard();
  }

  function render(state) {
    const active = state.activeUser;
    const balance = state.balance;

    // Destinatarios disponibles excluyendo al usuario autenticado actual
    const availableRecipients = store.getUsers().filter(
      (u) => u.id !== active.id && u.accountId
    );

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;">
        
        <!-- Grid Central: Saldo Disponible (Izquierda) y Transferencia Inmediata (Derecha) -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:24px;align-items:start;">
          
          <!-- Columna Izquierda: Tarjeta de Saldo y Recarga Rápida -->
          <div style="display:flex;flex-direction:column;gap:16px;">
            
            <!-- Tarjeta de Saldo con Gradiente Azul de Alto Contraste -->
            <div class="balance-card-gradient">
              <div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                  <div style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;color:#FFFFFF;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                    </svg>
                  </div>
                  <span style="font-size:15px;font-weight:600;color:#E0EDFA;letter-spacing:0.3px;">Saldo Disponible</span>
                </div>

                <!-- Monto en Cifras Tabulares Gigantes -->
                <div style="margin: 8px 0;">
                  <span class="tabular-nums" style="font-size:40px;font-weight:700;color:#FFFFFF;line-height:1;letter-spacing:-1px;">
                    ${formatCOP(balance)}
                  </span>
                </div>
              </div>
            </div>

            <!-- Sub-tarjeta de Recarga Rápida de Fondos -->
            <div class="bank-card" style="padding:18px 20px;display:flex;align-items:center;flex-wrap:wrap;gap:16px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#173B63" stroke-width="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                <span style="font-size:13px;font-weight:600;color:#111827;">Recarga rápida de fondos:</span>
              </div>
              
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button type="button" id="btnLoad50k" class="bank-btn-chip" ${isSubmittingLoad ? "disabled" : ""} style="padding:8px 14px;font-weight:600;">
                  + +$50.000 COP
                </button>
                <button type="button" id="btnLoad100k" class="bank-btn-chip" ${isSubmittingLoad ? "disabled" : ""} style="padding:8px 14px;font-weight:600;">
                  + +$100.000 COP
                </button>
              </div>
            </div>

          </div>

          <!-- Columna Derecha: Tarjeta de Transferencia Inmediata -->
          <div class="bank-card" style="padding:24px;">
            
            <!-- Encabezado de Transferencia -->
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
              <div style="width:36px;height:36px;border-radius:8px;background:#EAF2FA;color:#173B63;display:flex;align-items:center;justify-content:center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </div>
              <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0;">Transferencia</h2>
            </div>

            <!-- Formulario de Transferencias P2P -->
            <form id="transferForm" style="display:flex;flex-direction:column;gap:16px;">
              
              <!-- Destinatario -->
              <div>
                <label class="bank-label" for="transferRecipient" style="font-weight:600;color:#374151;">
                  Destinatario:
                </label>
                <div style="position:relative;display:flex;align-items:center;">
                  <div style="position:absolute;left:12px;color:#9CA3AF;pointer-events:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <select id="transferRecipient" class="bank-select" style="padding-left:38px;" required>
                    <option value="" disabled selected>Selecciona a quien...</option>
                    ${availableRecipients
                      .map(
                        (r) =>
                          `<option value="${r.accountId}" data-name="${r.name}">${r.name} (${r.phone}) — ${r.role}</option>`
                      )
                      .join("")}
                  </select>
                </div>
              </div>

              <!-- Monto a transferir -->
              <div>
                <label class="bank-label" for="transferAmount" style="font-weight:600;color:#374151;">
                  Monto a transferir (COP):
                </label>
                <div style="position:relative;display:flex;align-items:center;">
                  <div style="position:absolute;left:12px;color:#9CA3AF;pointer-events:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M15 9.5a3.5 3.5 0 0 0-5 0c0 2 5 2 5 4.5a3.5 3.5 0 0 1-5 0"/></svg>
                  </div>
                  <input id="transferAmount" class="bank-input tabular-nums" type="number" min="1" step="any" placeholder="Ej. 20000" style="padding-left:38px;" required />
                </div>
              </div>

              <!-- Concepto / Motivo -->
              <div>
                <label class="bank-label" for="transferMotive" style="font-weight:600;color:#374151;">
                  Concepto:
                </label>
                <div style="position:relative;display:flex;align-items:center;">
                  <div style="position:absolute;left:12px;color:#9CA3AF;pointer-events:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <input id="transferMotive" class="bank-input" type="text" placeholder="Ej. Cuota servicios, Almuerzo" style="padding-left:38px;" maxlength="100" />
                </div>
              </div>

              <!-- Botón Principal de Envío de Transferencia -->
              <button type="submit" id="btnSendTransfer" class="bank-btn bank-btn-primary" style="margin-top:6px;padding:12px 18px;font-size:14px;font-weight:600;gap:8px;background:#0C2038;" ${isSubmittingTransfer ? "disabled" : ""}>
                ${
                  isSubmittingTransfer
                    ? `<span class="bank-spinner"></span> Procesando transferencia...`
                    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Transferir Fondos →`
                }
              </button>

            </form>
          </div>

        </div>

      </div>
    `;

    // Asignación de manejadores de eventos
    const btnLoad50k = container.querySelector("#btnLoad50k");
    const btnLoad100k = container.querySelector("#btnLoad100k");
    const transferForm = container.querySelector("#transferForm");
    const amountInput = container.querySelector("#transferAmount");

    // Manejador de recargas rápidas
    async function handleLoad(amount) {
      if (isSubmittingLoad) return;
      isSubmittingLoad = true;

      try {
        const res = await api.loadBalance(active.accountId, amount, `Recarga rápida +$${amount.toLocaleString()}`);
        showToast(`Recarga exitosa por ${formatCOP(amount)}`, "success");
        // Actualización reactiva instantánea del saldo con la respuesta certificada por el backend
        store.setState({ balance: res.balance });
        // Recargar extracto contable en segundo plano para el módulo de Movimientos
        const history = await api.getHistory(active.accountId);
        store.setState({ history });
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        isSubmittingLoad = false;
      }
    }

    if (btnLoad50k) btnLoad50k.addEventListener("click", () => handleLoad(50000));
    if (btnLoad100k) btnLoad100k.addEventListener("click", () => handleLoad(100000));

    // Manejador del formulario de transferencias P2P
    if (transferForm) {
      transferForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const recipientSelect = container.querySelector("#transferRecipient");
        const motiveInput = container.querySelector("#transferMotive");

        const destAccountId = recipientSelect.value;
        const recipientOption = recipientSelect.options[recipientSelect.selectedIndex];
        const recipientName = recipientOption ? recipientOption.getAttribute("data-name") : "Destinatario";
        const amount = Number(amountInput.value);
        const motive = motiveInput.value.trim() || "Transferencia P2P";

        if (!destAccountId) {
          showToast("Debes seleccionar un destinatario válido", "warning");
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

        try {
          await api.transfer(active.accountId, destAccountId, amount, motive);
          showToast(`Transferencia exitosa de ${formatCOP(amount)} a ${recipientName}`, "success");
          
          // Descontar inmediatamente para reactividad instantánea en la interfaz
          store.setState({ balance: Math.max(0, balance - amount) });
          amountInput.value = "";
          motiveInput.value = "";

          // Sincronizar en segundo plano el saldo exacto y extracto contable del Libro Mayor
          const [balData, histData] = await Promise.all([
            api.getBalance(active.accountId),
            api.getHistory(active.accountId),
          ]);
          store.setState({ balance: balData.balance, history: histData });
        } catch (err) {
          showToast(err.message, "error");
        } finally {
          isSubmittingTransfer = false;
        }
      });
    }
  }

  // Carga inicial y suscripción a cambios de usuario activo
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
