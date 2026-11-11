/**
 * Módulo del Dashboard de Cuentas y Transferencias P2P para HabiReto.
 * 
 * Implementa la visualización del saldo disponible, recargas rápidas idempotentes,
 * formulario de transferencias P2P y extracto contable del libro mayor con balance_after.
 */

import { api, formatCOP, formatDate } from "../api.js";
import { DEMO_USERS, store } from "../state.js";
import { showToast } from "./toast.js";

export async function reloadDashboard() {
  const active = store.getActiveUser();
  if (!active || !active.accountId) return;

  try {
    const [balData, histData] = await Promise.all([
      api.getBalance(active.accountId),
      api.getHistory(active.accountId),
    ]);

    store.setState({
      balance: balData.balance,
      currency: balData.currency,
      history: histData,
      isLoading: false,
    });
  } catch (err) {
    store.setState({ isLoading: false });
    showToast(err.message, "error");
  }
}

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
    const history = state.history || [];

    // Filtra destinatarios para omitir al usuario activo
    const availableRecipients = store.getUsers().filter(
      (u) => u.id !== active.id && u.accountId
    );

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;">
        
        <!-- Grid Superior: Saldo Disponible y Transferencia Inmediata -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:24px;">
          
          <!-- Tarjeta de Saldo Disponible -->
          <div class="bank-card" style="display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                <span style="font-size:13px;font-weight:500;color:#667085;text-transform:uppercase;letter-spacing:0.5px;">Saldo Disponible</span>
                <span class="badge badge-navy">${active.accountNumber || "Cuenta Corriente"}</span>
              </div>
              <div class="tabular-nums" style="font-size:36px;font-weight:600;color:#111827;line-height:1.1;margin-bottom:8px;">
                ${formatCOP(balance)}
              </div>
              <p style="font-size:13px;color:#667085;margin:0;">
                Titular: <strong style="color:#111827;">${active.name}</strong> (${active.phone})
              </p>
            </div>

            <!-- Recargas Rápidas -->
            <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5EAF0;">
              <span class="bank-label" style="margin-bottom:8px;">Recarga rápida de fondos:</span>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" id="btnLoad50k" class="bank-btn-chip" ${isSubmittingLoad ? "disabled" : ""}>
                  +$50.000 COP
                </button>
                <button type="button" id="btnLoad100k" class="bank-btn-chip" ${isSubmittingLoad ? "disabled" : ""}>
                  +$100.000 COP
                </button>
              </div>
            </div>
          </div>

          <!-- Tarjeta de Transferencia P2P -->
          <div class="bank-card">
            <h2 style="font-size:18px;font-weight:600;color:#111827;margin:0 0 16px 0;">Transferencia Persona a Persona (P2P)</h2>
            <form id="transferForm" style="display:flex;flex-direction:column;gap:14px;">
              <div>
                <label class="bank-label" for="transferRecipient">Destinatario:</label>
                <select id="transferRecipient" class="bank-select" required>
                  <option value="" disabled selected>Selecciona un destinatario...</option>
                  ${availableRecipients
                    .map(
                      (r) =>
                        `<option value="${r.accountId}" data-name="${r.name}">${r.name} (${r.phone}) — ${r.role}</option>`
                    )
                    .join("")}
                </select>
              </div>

              <div>
                <label class="bank-label" for="transferAmount">Monto a transferir (COP):</label>
                <input id="transferAmount" class="bank-input tabular-nums" type="number" min="1" step="any" placeholder="Ej. 20000" required />
              </div>

              <div>
                <label class="bank-label" for="transferMotive">Concepto o motivo:</label>
                <input id="transferMotive" class="bank-input" type="text" placeholder="Ej. Cuota servicios, Almuerzo" maxlength="100" />
              </div>

              <button type="submit" id="btnSendTransfer" class="bank-btn bank-btn-primary" style="margin-top:4px;" ${isSubmittingTransfer ? "disabled" : ""}>
                ${isSubmittingTransfer ? `<span class="bank-spinner"></span> Procesando...` : `Transferir Fondos`}
              </button>
            </form>
          </div>

        </div>

        <!-- Extracto de Movimientos (Libro Mayor) -->
        <div class="bank-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div>
              <h2 style="font-size:18px;font-weight:600;color:#111827;margin:0;">Extracto de Movimientos (Libro Mayor)</h2>
              <span style="font-size:13px;color:#667085;">Registro auditable con saldos posteriores (balance_after)</span>
            </div>
            <button type="button" id="btnRefreshHistory" class="bank-btn bank-btn-secondary" style="font-size:12px;padding:6px 12px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
              Actualizar
            </button>
          </div>

          ${
            history.length === 0
              ? `
              <div class="bank-empty-state">
                <svg class="bank-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <div style="font-weight:500;margin-bottom:4px;">No hay movimientos registrados</div>
                <div style="font-size:13px;">Realiza una recarga o transferencia para ver los asientos contables.</div>
              </div>
            `
              : `
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left;">
                  <thead>
                    <tr style="border-bottom:1px solid #E5EAF0;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">
                      <th style="padding:10px 12px;">Tipo</th>
                      <th style="padding:10px 12px;">Fecha y Hora</th>
                      <th style="padding:10px 12px;text-align:right;">Monto</th>
                      <th style="padding:10px 12px;text-align:right;">Saldo Posterior</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${history
                      .map((entry) => {
                        const isCredit = entry.entry_type === "CREDIT";
                        return `
                        <tr style="border-bottom:1px solid #F2F4F7;transition:background-color 100ms;" onmouseover="this.style.backgroundColor='#F9FAFB'" onmouseout="this.style.backgroundColor='transparent'">
                          <td style="padding:12px;">
                            ${
                              isCredit
                                ? `<span class="badge badge-success"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Ingreso (Crédito)</span>`
                                : `<span class="badge badge-danger"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg> Egreso (Débito)</span>`
                            }
                          </td>
                          <td style="padding:12px;color:#667085;">
                            ${formatDate(entry.created_at)}
                          </td>
                          <td class="tabular-nums" style="padding:12px;text-align:right;font-weight:600;color:${isCredit ? "var(--color-success)" : "var(--color-danger)"};">
                            ${isCredit ? "+" : "-"}${formatCOP(entry.amount)}
                          </td>
                          <td class="tabular-nums" style="padding:12px;text-align:right;font-weight:500;color:#111827;">
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

      </div>
    `;

    // Asignación de manejadores de eventos
    const btnLoad50k = container.querySelector("#btnLoad50k");
    const btnLoad100k = container.querySelector("#btnLoad100k");
    const transferForm = container.querySelector("#transferForm");
    const btnRefreshHistory = container.querySelector("#btnRefreshHistory");

    async function handleLoad(amount) {
      if (isSubmittingLoad) return;
      isSubmittingLoad = true;

      try {
        const res = await api.loadBalance(active.accountId, amount, `Recarga rápida +$${amount.toLocaleString()}`);
        showToast(`Recarga exitosa por ${formatCOP(amount)}`, "success");
        // Actualización reactiva instantánea del saldo con la respuesta certificada por el backend
        store.setState({ balance: res.balance });
        // Recargar extractos en segundo plano sin bloquear el saldo visual
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

    if (transferForm) {
      transferForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const recipientSelect = container.querySelector("#transferRecipient");
        const amountInput = container.querySelector("#transferAmount");
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
          // Descontar inmediatamente para reactividad instantánea
          store.setState({ balance: Math.max(0, balance - amount) });
          // Sincronizar en segundo plano el saldo exacto y extracto contable
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

    if (btnRefreshHistory) {
      btnRefreshHistory.addEventListener("click", async () => {
        await loadData();
        showToast("Extracto actualizado", "info", 1500);
      });
    }
  }

  // Carga inicial de datos y suscripción a cambios de usuario activo
  let currentUserId = store.getActiveUser()?.id;
  loadData();
  render(store.getState());

  store.subscribe((state) => {
    const newUserId = state.activeUser?.id;
    // Si la identidad activa cambió, sincronizar obligatoriamente con el backend
    if (newUserId && newUserId !== currentUserId) {
      currentUserId = newUserId;
      loadData();
    }
    render(state);
  });
}
