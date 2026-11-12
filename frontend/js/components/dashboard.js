/**
 * Módulo del Panel Central (Dashboard) para HabiReto.
 * 
 * Implementa la interfaz principal de banca digital con el mínimo de ruido:
 * 1. Saldo disponible, número de cuenta y llave única estilo Bre-B (@ABC123).
 * 2. Recarga directa escribiendo el monto.
 * 3. Transferencia P2P mediante llave única (@ABC123) con cálculo en vivo del saldo restante.
 */

import { api, formatCOP } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

/**
 * Recarga los datos de balance contable del usuario activo.
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
 * Inicializa el componente del Panel Central en el contenedor DOM correspondiente.
 * 
 * @param {string} containerId - Identificador del contenedor raíz.
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
    const balance = state.balance || 0;

    // Composición mínima: saldo + recarga directa a la izquierda, transferencia por llave @ABC123 a la derecha.
    container.innerHTML = `
      <div class="split">

        <div class="stack-md">
          <div class="balance-card">
            <span class="balance-label">Saldo disponible</span>
            <span class="balance-amount tabular-nums">${formatCOP(balance)}</span>
            <span class="balance-meta tabular-nums">${active.userKey || "@ALI111"} · ${active.accountNumber || "ACC-001"} · COP</span>
          </div>

          <div class="bank-card">
            <h2 class="card-title">Recargar</h2>
            <form id="loadBalanceForm" class="stack-sm">
              <div>
                <label class="bank-label" for="loadAmountInput">Monto (COP)</label>
                <input id="loadAmountInput" class="bank-input tabular-nums" type="number" min="1" step="any" placeholder="0" required />
              </div>
              <button type="submit" id="btnSubmitLoad" class="bank-btn bank-btn-secondary" style="padding:10px 16px;" ${isSubmittingLoad ? "disabled" : ""}>
                ${isSubmittingLoad ? `<span class="bank-spinner"></span> Recargando…` : "Recargar"}
              </button>
            </form>
          </div>
        </div>

        <div class="bank-card">
          <h2 class="card-title">Transferir</h2>

          <form id="transferForm" class="stack-md">
            <div>
              <label class="bank-label" for="transferRecipientKey">Llave del destinatario</label>
              <input id="transferRecipientKey" class="bank-input tabular-nums" type="text" placeholder="Ej. @BOB222" maxlength="7" required />
            </div>

            <div>
              <div class="kv" style="margin-bottom:6px;">
                <label class="bank-label" for="transferAmount" style="margin:0;">Monto</label>
                <span id="remainingBalanceIndicator" class="muted">
                  Disponible <strong class="tabular-nums">${formatCOP(balance)}</strong>
                </span>
              </div>
              <input id="transferAmount" class="bank-input tabular-nums" type="number" min="1" step="any" placeholder="0" required />
            </div>

            <div>
              <label class="bank-label" for="transferMotive">Concepto (opcional)</label>
              <input id="transferMotive" class="bank-input" type="text" placeholder="Ej. Almuerzo" maxlength="100" />
            </div>

            <button type="submit" id="btnSendTransfer" class="bank-btn bank-btn-primary" style="margin-top:4px;padding:12px 20px;" ${isSubmittingTransfer ? "disabled" : ""}>
              ${isSubmittingTransfer ? `<span class="bank-spinner"></span> Enviando…` : "Transferir"}
            </button>
          </form>
        </div>

      </div>
    `;

    // Asignación de manejadores de eventos
    const loadForm = container.querySelector("#loadBalanceForm");
    const loadAmountInput = container.querySelector("#loadAmountInput");
    const transferForm = container.querySelector("#transferForm");
    const amountInput = container.querySelector("#transferAmount");
    const remainingIndicator = container.querySelector("#remainingBalanceIndicator");

    // Manejador de cálculo en vivo de saldo restante
    if (amountInput && remainingIndicator) {
      amountInput.addEventListener("input", (e) => {
        const val = Number(e.target.value);
        if (isNaN(val) || val <= 0) {
          remainingIndicator.innerHTML = `Disponible <strong class="tabular-nums">${formatCOP(balance)}</strong>`;
        } else if (val > balance) {
          const diff = val - balance;
          remainingIndicator.innerHTML = `<span class="amount-debit">Excede en ${formatCOP(diff)}</span>`;
        } else {
          const rest = balance - val;
          remainingIndicator.innerHTML = `Quedan <strong class="tabular-nums">${formatCOP(rest)}</strong>`;
        }
      });
    }

    // Manejador de recarga por monto escrito directamente
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
        const submitBtn = container.querySelector("#btnSubmitLoad");
        if (submitBtn) submitBtn.disabled = true;

        try {
          const res = await api.loadBalance(active.accountId, amount, `Recarga +$${amount.toLocaleString()}`);
          showToast(`Recarga exitosa por ${formatCOP(amount)}`, "success");
          loadAmountInput.value = "";
          store.setState({ balance: res.balance });
          const history = await api.getHistory(active.accountId);
          store.setState({ history });
        } catch (err) {
          showToast(err.message, "error");
        } finally {
          isSubmittingLoad = false;
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // Manejador del formulario de transferencias P2P mediante llave @ABC123
    if (transferForm) {
      transferForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const recipientKeyInput = container.querySelector("#transferRecipientKey");
        const motiveInput = container.querySelector("#transferMotive");

        let destKey = (recipientKeyInput.value || "").trim().toUpperCase();
        if (destKey && !destKey.startsWith("@")) {
          destKey = `@${destKey}`;
        }

        const amount = Number(amountInput.value);
        const motive = motiveInput.value.trim() || "Transferencia P2P";

        if (!/^@[A-Z]{3}[0-9]{3}$/.test(destKey)) {
          showToast("La llave debe iniciar con @ seguida de 3 letras y 3 números (ej. @BOB222)", "warning");
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

        try {
          await api.transfer(active.accountId, destKey, amount, motive);
          showToast(`Transferencia exitosa de ${formatCOP(amount)} a ${destKey}`, "success");
          
          store.setState({ balance: Math.max(0, balance - amount) });
          recipientKeyInput.value = "";
          amountInput.value = "";
          motiveInput.value = "";

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

  // Carga inicial y reactividad
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