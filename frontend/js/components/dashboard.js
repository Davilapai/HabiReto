/**
 * Módulo del Panel Central (Dashboard) para HabiReto.
 * 
 * Implementa la interfaz principal de banca digital con el mínimo de ruido:
 * 1. Saldo disponible y número de cuenta.
 * 2. Recarga simulada con atajos de un clic.
 * 3. Transferencia P2P con cálculo en vivo del saldo restante y atajos de montos.
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

    // Destinatarios disponibles excluyendo al usuario autenticado actual
    const availableRecipients = store.getUsers().filter(
      (u) => u.id !== active.id && u.accountId
    );

    // Composición mínima: saldo + recarga a la izquierda, transferencia a la derecha.
    // Se omiten métricas técnicas (invariantes, bloqueos) que no ayudan a operar.
    container.innerHTML = `
      <div class="split">

        <div class="stack-md">
          <div class="balance-card">
            <span class="balance-label">Saldo disponible</span>
            <span class="balance-amount tabular-nums">${formatCOP(balance)}</span>
            <span class="balance-meta tabular-nums">${active.accountNumber || "ACC-001"} · COP</span>
          </div>

          <div class="bank-card">
            <h2 class="card-title">Recargar</h2>
            <div class="chips">
              <button type="button" id="btnLoad50k" class="bank-btn-chip" ${isSubmittingLoad ? "disabled" : ""}>+$50.000</button>
              <button type="button" id="btnLoad100k" class="bank-btn-chip" ${isSubmittingLoad ? "disabled" : ""}>+$100.000</button>
              <button type="button" id="btnLoad200k" class="bank-btn-chip" ${isSubmittingLoad ? "disabled" : ""}>+$200.000</button>
            </div>
          </div>
        </div>

        <div class="bank-card">
          <h2 class="card-title">Transferir</h2>

          <form id="transferForm" class="stack-md">
            <div>
              <label class="bank-label" for="transferRecipient">Para</label>
              <select id="transferRecipient" class="bank-select" required>
                <option value="" disabled selected>Selecciona un destinatario</option>
                ${availableRecipients
                  .map(
                    (r) =>
                      `<option value="${r.accountId}" data-name="${r.name}">${r.name} · ${r.phone}</option>`
                  )
                  .join("")}
              </select>
            </div>

            <div>
              <div class="kv" style="margin-bottom:6px;">
                <label class="bank-label" for="transferAmount" style="margin:0;">Monto</label>
                <span id="remainingBalanceIndicator" class="muted">
                  Disponible <strong class="tabular-nums">${formatCOP(balance)}</strong>
                </span>
              </div>
              <input id="transferAmount" class="bank-input tabular-nums" type="number" min="1" step="any" placeholder="0" required />
              <div class="chips" style="margin-top:8px;">
                <button type="button" class="bank-btn-chip btnPresetTransfer" data-val="20000">$20.000</button>
                <button type="button" class="bank-btn-chip btnPresetTransfer" data-val="50000">$50.000</button>
                ${balance > 0 ? `<button type="button" class="bank-btn-chip btnPresetTransfer" data-val="${balance}">Todo</button>` : ""}
              </div>
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
    const btnLoad50k = container.querySelector("#btnLoad50k");
    const btnLoad100k = container.querySelector("#btnLoad100k");
    const btnLoad200k = container.querySelector("#btnLoad200k");
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

    // Chips de montos rápidos en transferencia
    container.querySelectorAll(".btnPresetTransfer").forEach((btn) => {
      btn.addEventListener("click", () => {
        amountInput.value = btn.getAttribute("data-val");
        amountInput.dispatchEvent(new Event("input"));
      });
    });

    // Manejador de recargas rápidas
    async function handleLoad(amount) {
      if (isSubmittingLoad) return;
      isSubmittingLoad = true;

      try {
        const res = await api.loadBalance(active.accountId, amount, `Recarga rápida +$${amount.toLocaleString()}`);
        showToast(`Recarga exitosa por ${formatCOP(amount)}`, "success");
        store.setState({ balance: res.balance });
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
    if (btnLoad200k) btnLoad200k.addEventListener("click", () => handleLoad(200000));

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
          
          store.setState({ balance: Math.max(0, balance - amount) });
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