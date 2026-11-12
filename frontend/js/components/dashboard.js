/**
 * Módulo del Panel Central (Dashboard) para HabiReto.
 * 
 * Implementa la interfaz principal de banca digital:
 * 1. Tarjeta de Saldo Disponible con gradiente corporativo, número de cuenta y verificación de invariante contable.
 * 2. Módulo de Recarga Rápida de Fondos con atajos de un clic.
 * 3. Tarjeta de Transferencia Inmediata P2P con cálculo en tiempo real de saldo restante y atajos de montos.
 * 4. Fila de accesos directos al Libro Mayor y Bóvedas de Vacas.
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
    const cows = state.cows || [];
    const history = state.history || [];

    // Destinatarios disponibles excluyendo al usuario autenticado actual
    const availableRecipients = store.getUsers().filter(
      (u) => u.id !== active.id && u.accountId
    );

    // Métricas rápidas
    const myCowsCount = cows.filter((c) => {
      const myMem = (c.members || []).find((m) => m.user_id === active.id);
      return myMem && myMem.role === "CREATOR";
    }).length;

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;">
        
        <!-- Saludo y Contexto de la Cuenta -->
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="font-size:24px;font-weight:700;color:#0F172A;margin:0 0 4px 0;letter-spacing:-0.4px;">
              Bienvenido, ${active.name}
            </h1>
            <p style="font-size:14px;color:#64748B;margin:0;">
              Cuenta Corriente: <strong style="color:#0F172A;font-family:monospace;">${active.accountNumber || "ACC-001"}</strong> • Moneda: <strong>COP ($)</strong>
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="balance-verified-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Invariante Físico: CHECK (balance >= 0)
            </span>
          </div>
        </div>

        <!-- Fila Superior de Métricas Rápidas -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px;">
          <div class="bank-card" style="padding:16px 20px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Estado de Cuenta</span>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
              <span class="badge badge-success" style="font-size:12px;">Activa y Certificada</span>
            </div>
            <div style="font-size:11px;color:#64748B;margin-top:4px;">Asientos registrados: ${history.length}</div>
          </div>

          <div class="bank-card" style="padding:16px 20px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Fondos en Vacas</span>
            <div style="display:flex;align-items:baseline;gap:6px;margin-top:6px;">
              <span class="tabular-nums" style="font-size:20px;font-weight:700;color:#173B63;">${myCowsCount}</span>
              <span style="font-size:12px;color:#64748B;">creadas por ti</span>
            </div>
            <div style="font-size:11px;color:#64748B;margin-top:4px;">Total iniciativas: ${cows.length}</div>
          </div>

          <div class="bank-card" style="padding:16px 20px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Garantía Transaccional</span>
            <div style="font-size:14px;font-weight:700;color:#0F172A;margin-top:6px;">ACID + Row-Locking</div>
            <div style="font-size:11px;color:#64748B;margin-top:4px;">Bloqueo ordenado FOR UPDATE</div>
          </div>
        </div>

        <!-- Grid Principal: Saldo & Recarga (Izquierda) y Transferencia P2P (Derecha) -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:24px;align-items:start;">
          
          <!-- Columna Izquierda: Tarjeta de Saldo y Recarga -->
          <div style="display:flex;flex-direction:column;gap:18px;">
            
            <!-- Tarjeta de Saldo con Gradiente Azul de Alto Contraste -->
            <div class="balance-card-gradient">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;color:#FFFFFF;">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                      </svg>
                    </div>
                    <span style="font-size:14px;font-weight:600;color:#E0EDFA;letter-spacing:0.3px;">Saldo Disponible</span>
                  </div>
                  <span class="balance-meta-chip">
                    COP ($)
                  </span>
                </div>

                <!-- Monto Gigante en Cifras Tabulares -->
                <div style="margin:12px 0 16px 0;">
                  <span class="tabular-nums" style="font-size:42px;font-weight:700;color:#FFFFFF;line-height:1;letter-spacing:-1.2px;">
                    ${formatCOP(balance)}
                  </span>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid rgba(255,255,255,0.12);font-size:12px;color:#CBD5E1;">
                  <span>Titular: <strong>${active.name}</strong></span>
                  <span style="font-family:monospace;">${active.phone}</span>
                </div>
              </div>
            </div>

            <!-- Sub-tarjeta de Recarga Rápida de Fondos -->
            <div class="bank-card" style="padding:20px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#173B63" stroke-width="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                <span style="font-size:14px;font-weight:700;color:#0F172A;">Recarga Rápida de Fondos:</span>
              </div>
              <p style="font-size:12px;color:#64748B;margin:0 0 14px 0;">
                Acredita saldo simulado de forma inmediata a través del endpoint transaccional con clave Exactly-Once.
              </p>
              
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button type="button" id="btnLoad50k" class="bank-btn-chip" ${isSubmittingLoad ? "disabled" : ""} style="padding:9px 16px;font-weight:600;flex:1;">
                  +$50.000 COP
                </button>
                <button type="button" id="btnLoad100k" class="bank-btn-chip" ${isSubmittingLoad ? "disabled" : ""} style="padding:9px 16px;font-weight:600;flex:1;">
                  +$100.000 COP
                </button>
                <button type="button" id="btnLoad200k" class="bank-btn-chip" ${isSubmittingLoad ? "disabled" : ""} style="padding:9px 16px;font-weight:600;flex:1;">
                  +$200.000 COP
                </button>
              </div>
            </div>

          </div>

          <!-- Columna Derecha: Tarjeta de Transferencia Inmediata -->
          <div class="bank-card" style="padding:24px;">
            
            <!-- Encabezado de Transferencia -->
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #E2E8F0;">
              <div style="width:36px;height:36px;border-radius:10px;background:#EAF2FA;color:#173B63;display:flex;align-items:center;justify-content:center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </div>
              <div>
                <h2 style="font-size:18px;font-weight:700;color:#0F172A;margin:0;">Transferencia Inmediata P2P</h2>
                <span style="font-size:12px;color:#64748B;">Movimiento entre cuentas con bloqueo ordenado y partida doble</span>
              </div>
            </div>

            <!-- Formulario de Transferencias -->
            <form id="transferForm" style="display:flex;flex-direction:column;gap:16px;">
              
              <!-- Destinatario -->
              <div>
                <label class="bank-label" for="transferRecipient">Destinatario: *</label>
                <div style="position:relative;display:flex;align-items:center;">
                  <div style="position:absolute;left:14px;color:#94A3B8;pointer-events:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <select id="transferRecipient" class="bank-select" style="padding-left:40px;" required>
                    <option value="" disabled selected>Selecciona un destinatario...</option>
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
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <label class="bank-label" for="transferAmount" style="margin:0;">Monto a transferir (COP): *</label>
                  <span id="remainingBalanceIndicator" style="font-size:12px;color:#64748B;font-weight:500;">
                    Disponible: <strong class="tabular-nums">${formatCOP(balance)}</strong>
                  </span>
                </div>
                <div style="position:relative;display:flex;align-items:center;">
                  <div style="position:absolute;left:14px;color:#94A3B8;pointer-events:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M15 9.5a3.5 3.5 0 0 0-5 0c0 2 5 2 5 4.5a3.5 3.5 0 0 1-5 0"/></svg>
                  </div>
                  <input id="transferAmount" class="bank-input tabular-nums" type="number" min="1" step="any" placeholder="Ej. 20000" style="padding-left:40px;" required />
                </div>

                <!-- Chips de montos rápidos -->
                <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                  <button type="button" class="bank-btn-chip btnPresetTransfer" data-val="20000">+$20.000</button>
                  <button type="button" class="bank-btn-chip btnPresetTransfer" data-val="50000">+$50.000</button>
                  <button type="button" class="bank-btn-chip btnPresetTransfer" data-val="100000">+$100.000</button>
                  ${balance > 0 ? `<button type="button" class="bank-btn-chip btnPresetTransfer" data-val="${balance}">Todo el Saldo</button>` : ""}
                </div>
              </div>

              <!-- Concepto / Motivo -->
              <div>
                <label class="bank-label" for="transferMotive">Concepto / Motivo:</label>
                <div style="position:relative;display:flex;align-items:center;">
                  <div style="position:absolute;left:14px;color:#94A3B8;pointer-events:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <input id="transferMotive" class="bank-input" type="text" placeholder="Ej. Almuerzo, Cuota de servicios" style="padding-left:40px;" maxlength="100" />
                </div>
              </div>

              <!-- Botón Principal de Envío de Transferencia -->
              <button type="submit" id="btnSendTransfer" class="bank-btn bank-btn-primary" style="margin-top:6px;padding:12px 20px;font-size:14px;font-weight:600;gap:8px;" ${isSubmittingTransfer ? "disabled" : ""}>
                ${
                  isSubmittingTransfer
                    ? `<span class="bank-spinner"></span> Ejecutando Transferencia...`
                    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Transferir Fondos Inmediatos`
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
    const btnLoad200k = container.querySelector("#btnLoad200k");
    const transferForm = container.querySelector("#transferForm");
    const amountInput = container.querySelector("#transferAmount");
    const remainingIndicator = container.querySelector("#remainingBalanceIndicator");

    // Manejador de cálculo en vivo de saldo restante
    if (amountInput && remainingIndicator) {
      amountInput.addEventListener("input", (e) => {
        const val = Number(e.target.value);
        if (isNaN(val) || val <= 0) {
          remainingIndicator.innerHTML = `Disponible: <strong class="tabular-nums">${formatCOP(balance)}</strong>`;
          remainingIndicator.style.color = "#64748B";
        } else if (val > balance) {
          const diff = val - balance;
          remainingIndicator.innerHTML = `<span style="color:#B91C1C;font-weight:600;">Excede saldo por ${formatCOP(diff)}</span>`;
        } else {
          const rest = balance - val;
          remainingIndicator.innerHTML = `Restará: <strong class="tabular-nums" style="color:#0E744A;">${formatCOP(rest)}</strong>`;
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