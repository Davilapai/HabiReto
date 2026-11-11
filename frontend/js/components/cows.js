/**
 * Módulo de Fondos Colaborativos ("Vacas") para HabiReto.
 * 
 * Gestiona la creación de iniciativas públicas y anónimas, aportes económicos atómicos,
 * barras de progreso acotadas al 100% y desembolso exclusivo para creadores autorizados.
 */

import { api, formatCOP, formatDate } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

export function initCows(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let activeModal = null; // 'create' | 'contribute' | 'disburse' | 'members'
  let selectedCow = null;
  let isSubmitting = false;

  async function loadCows() {
    try {
      const cows = await api.listCows();
      store.setState({ cows });
    } catch (err) {
      showToast(`Error al cargar vacas: ${err.message}`, "error");
    }
  }

  function render(state) {
    const active = state.activeUser;
    const cows = state.cows || [];
    const balance = state.balance || 0;

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;">
        
        <!-- Cabecera del Módulo con Acción Principal -->
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
          <div>
            <h2 style="font-size:22px;font-weight:600;color:#111827;margin:0 0 4px 0;">Fondos Colaborativos ("Vacas")</h2>
            <p style="font-size:13px;color:#667085;margin:0;">
              Crea iniciativas de ahorro grupal, aporta atómicamente y gestiona la recaudación con bóvedas dedicadas.
            </p>
          </div>
          <button type="button" id="btnOpenCreateCow" class="bank-btn bank-btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Crear Nueva Vaca
          </button>
        </div>

        <!-- Grid de Tarjetas de Vacas -->
        ${
          cows.length === 0
            ? `
            <div class="bank-card bank-empty-state">
              <svg class="bank-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/><path d="M16 12l-4-4-4 4M12 16V9"/>
              </svg>
              <div style="font-weight:500;margin-bottom:4px;">No hay fondos colaborativos activos</div>
              <div style="font-size:13px;">Crea la primera vaca para comenzar una colecta grupal.</div>
            </div>
          `
            : `
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(340px, 1fr));gap:20px;">
              ${cows
                .map((cow) => {
                  const isAnonymous = cow.visibility_type === "ANONYMOUS";
                  const isCompleted = cow.status === "COMPLETED";
                  const isDisbursed = cow.status === "DISBURSED";
                  const isCancelled = cow.status === "CANCELLED";
                  const isActive = cow.status === "ACTIVE";

                  const progress = Math.min(100, Math.round((cow.collected_amount / cow.target_amount) * 100));

                  // Identificar si el usuario activo es el creador de esta vaca
                  const myMembership = (cow.members || []).find((m) => m.user_id === active.id);
                  const isCreator = myMembership && myMembership.role === "CREATOR";

                  const canDisburse = isCreator && (isActive || isCompleted) && cow.collected_amount > 0;
                  const canContribute = (isActive || isCompleted) && !isDisbursed && !isCancelled;

                  return `
                    <div class="bank-card bank-card-interactive" style="display:flex;flex-direction:column;justify-content:space-between;">
                      <div>
                        <!-- Insignias Superiores -->
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                          ${
                            isAnonymous
                              ? `<span class="badge badge-warning" title="Aportes individuales confidenciales"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Anónima (Privada)</span>`
                              : `<span class="badge badge-success" title="Aportes visibles para todos"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg> Pública</span>`
                          }

                          ${
                            isDisbursed
                              ? `<span class="badge badge-navy">Desembolsada</span>`
                              : isCompleted
                              ? `<span class="badge badge-success">Meta Alcanzada</span>`
                              : isCancelled
                              ? `<span class="badge badge-danger">Cancelada</span>`
                              : `<span class="badge badge-info">Activa</span>`
                          }
                        </div>

                        <!-- Título y Descripción -->
                        <h3 style="font-size:17px;font-weight:600;color:#111827;margin:0 0 6px 0;">${cow.title}</h3>
                        <p style="font-size:13px;color:#667085;margin:0 0 16px 0;line-height:1.4;">
                          ${cow.description || "Iniciativa colaborativa"}
                        </p>

                        <!-- Montos y Progreso -->
                        <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-end;">
                          <div>
                            <span style="font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:0.5px;">Recaudado</span>
                            <div class="tabular-nums" style="font-size:20px;font-weight:600;color:#111827;">
                              ${formatCOP(cow.collected_amount)}
                            </div>
                          </div>
                          <div style="text-align:right;">
                            <span style="font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:0.5px;">Meta</span>
                            <div class="tabular-nums" style="font-size:14px;color:#667085;">
                              ${formatCOP(cow.target_amount)}
                            </div>
                          </div>
                        </div>

                        <!-- Barra de Progreso -->
                        <div style="margin-bottom:16px;">
                          <div class="bank-progress-track">
                            <div class="bank-progress-bar" style="width:${progress}%;"></div>
                          </div>
                          <div style="display:flex;justify-content:space-between;font-size:12px;color:#667085;margin-top:4px;">
                            <span>Avance: <strong style="color:#111827;">${cow.progress_percentage}%</strong></span>
                            <span>${(cow.members || []).length} participante(s)</span>
                          </div>
                        </div>

                        <!-- Mi aporte personal -->
                        ${
                          cow.my_contribution > 0
                            ? `
                            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:8px 12px;margin-bottom:16px;font-size:12px;display:flex;justify-content:space-between;align-items:center;">
                              <span style="color:#667085;">Tu aporte acumulado:</span>
                              <strong class="tabular-nums" style="color:#16865B;font-size:13px;">${formatCOP(cow.my_contribution)}</strong>
                            </div>
                          `
                            : ""
                        }
                      </div>

                      <!-- Acciones de la Tarjeta -->
                      <div style="display:flex;gap:8px;padding-top:14px;border-top:1px solid #E5EAF0;">
                        <button type="button" class="bank-btn bank-btn-secondary btnViewMembers" data-id="${cow.id}" style="flex:1;font-size:13px;padding:8px;">
                          Participantes
                        </button>
                        
                        ${
                          canContribute
                            ? `
                            <button type="button" class="bank-btn bank-btn-primary btnOpenContribute" data-id="${cow.id}" style="flex:1;font-size:13px;padding:8px;">
                              Aportar
                            </button>
                          `
                            : ""
                        }

                        ${
                          canDisburse
                            ? `
                            <button type="button" class="bank-btn btnOpenDisburse" data-id="${cow.id}" style="flex:1;font-size:13px;padding:8px;background-color:#16865B;color:#FFFFFF;">
                              Desembolsar
                            </button>
                          `
                            : ""
                        }
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          `
        }

        <!-- Contenedor dinámico de Modales -->
        <div id="cowModalRoot"></div>

      </div>
    `;

    // Manejadores de botones del Grid
    const btnOpenCreateCow = container.querySelector("#btnOpenCreateCow");
    if (btnOpenCreateCow) {
      btnOpenCreateCow.addEventListener("click", () => {
        openCreateModal();
      });
    }

    container.querySelectorAll(".btnViewMembers").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const cowId = e.currentTarget.getAttribute("data-id");
        const cow = cows.find((c) => c.id === cowId);
        if (cow) openMembersModal(cow);
      });
    });

    container.querySelectorAll(".btnOpenContribute").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const cowId = e.currentTarget.getAttribute("data-id");
        const cow = cows.find((c) => c.id === cowId);
        if (cow) openContributeModal(cow);
      });
    });

    container.querySelectorAll(".btnOpenDisburse").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const cowId = e.currentTarget.getAttribute("data-id");
        const cow = cows.find((c) => c.id === cowId);
        if (cow) openDisburseModal(cow);
      });
    });
  }

  // ------------------------------------------------------------------------
  // MODALES DEL SISTEMA
  // ------------------------------------------------------------------------

  function getModalRoot() {
    return container.querySelector("#cowModalRoot");
  }

  function closeModal() {
    activeModal = null;
    selectedCow = null;
    const root = getModalRoot();
    if (root) root.innerHTML = "";
  }

  // Modal 1: Creación de Vaca
  function openCreateModal() {
    activeModal = "create";
    const root = getModalRoot();
    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="font-size:18px;font-weight:600;margin:0;color:#111827;">Crear Fondo Colaborativo</h3>
            <button type="button" class="btnModalClose" style="background:none;border:none;cursor:pointer;color:#98A2B3;padding:4px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <form id="createCowForm" style="display:flex;flex-direction:column;gap:14px;">
            <div>
              <label class="bank-label" for="cowTitle">Nombre de la Vaca:</label>
              <input id="cowTitle" class="bank-input" type="text" placeholder="Ej. Viaje a la Playa, Asado" required maxlength="120" />
            </div>

            <div>
              <label class="bank-label" for="cowDescription">Descripción o propósito (opcional):</label>
              <textarea id="cowDescription" class="bank-input" rows="2" placeholder="Motivo o detalle de la iniciativa" maxlength="255"></textarea>
            </div>

            <div>
              <label class="bank-label" for="cowTargetAmount">Meta de recaudación (COP):</label>
              <input id="cowTargetAmount" class="bank-input tabular-nums" type="number" min="1" step="1000" placeholder="Ej. 100000" required />
            </div>

            <div>
              <label class="bank-label" for="cowVisibility">Modalidad de privacidad:</label>
              <select id="cowVisibility" class="bank-select" required>
                <option value="PUBLIC">Abierta (Pública) — Todos los aportes son visibles</option>
                <option value="ANONYMOUS">Privada (Anónima) — Aportes individuales ocultos (Zero-Trust)</option>
              </select>
            </div>

            <div style="display:flex;gap:10px;margin-top:12px;justify-content:flex-end;">
              <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cancelar</button>
              <button type="submit" id="btnSubmitCreateCow" class="bank-btn bank-btn-primary" ${isSubmitting ? "disabled" : ""}>
                ${isSubmitting ? `<span class="bank-spinner"></span> Creando...` : `Crear Vaca`}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    root.querySelectorAll(".btnModalClose").forEach((b) => b.addEventListener("click", closeModal));

    const form = root.querySelector("#createCowForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = root.querySelector("#cowTitle").value.trim();
      const desc = root.querySelector("#cowDescription").value.trim();
      const target = Number(root.querySelector("#cowTargetAmount").value);
      const visibility = root.querySelector("#cowVisibility").value;

      if (!title) {
        showToast("El nombre de la vaca es obligatorio", "warning");
        return;
      }
      if (isNaN(target) || target <= 0) {
        showToast("La meta debe ser estrictamente positiva", "warning");
        return;
      }

      isSubmitting = true;
      const submitBtn = root.querySelector("#btnSubmitCreateCow");
      if (submitBtn) submitBtn.disabled = true;

      try {
        await api.createCow(title, desc, target, visibility);
        showToast(`Vaca "${title}" creada exitosamente`, "success");
        closeModal();
        await loadCows();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        isSubmitting = false;
      }
    });
  }

  // Modal 2: Aporte a una Vaca
  function openContributeModal(cow) {
    activeModal = "contribute";
    selectedCow = cow;
    const root = getModalRoot();
    const balance = store.getState().balance || 0;

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div>
              <h3 style="font-size:18px;font-weight:600;margin:0;color:#111827;">Aportar a "${cow.title}"</h3>
              <span style="font-size:12px;color:#667085;">Transferencia atómica a la cuenta bóveda</span>
            </div>
            <button type="button" class="btnModalClose" style="background:none;border:none;cursor:pointer;color:#98A2B3;padding:4px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
              <span style="color:#667085;">Tu saldo disponible:</span>
              <strong class="tabular-nums" style="color:#111827;">${formatCOP(balance)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:#667085;">Meta de la vaca:</span>
              <span class="tabular-nums">${formatCOP(cow.target_amount)} (Faltan: ${formatCOP(Math.max(0, cow.target_amount - cow.collected_amount))})</span>
            </div>
          </div>

          <form id="contributeForm" style="display:flex;flex-direction:column;gap:14px;">
            <div>
              <label class="bank-label" for="contribAmount">Monto a aportar (COP):</label>
              <input id="contribAmount" class="bank-input tabular-nums" type="number" min="1" step="1000" placeholder="Ej. 30000" required />
              
              <!-- Chips de montos sugeridos -->
              <div style="display:flex;gap:6px;margin-top:8px;">
                <button type="button" class="bank-btn-chip btnPresetContrib" data-val="10000">+$10.000</button>
                <button type="button" class="bank-btn-chip btnPresetContrib" data-val="20000">+$20.000</button>
                <button type="button" class="bank-btn-chip btnPresetContrib" data-val="50000">+$50.000</button>
              </div>
            </div>

            <div style="display:flex;gap:10px;margin-top:12px;justify-content:flex-end;">
              <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cancelar</button>
              <button type="submit" id="btnSubmitContrib" class="bank-btn bank-btn-primary" ${isSubmitting ? "disabled" : ""}>
                ${isSubmitting ? `<span class="bank-spinner"></span> Procesando...` : `Confirmar Aporte`}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    root.querySelectorAll(".btnModalClose").forEach((b) => b.addEventListener("click", closeModal));

    const inputAmount = root.querySelector("#contribAmount");
    root.querySelectorAll(".btnPresetContrib").forEach((btn) => {
      btn.addEventListener("click", () => {
        inputAmount.value = btn.getAttribute("data-val");
      });
    });

    const form = root.querySelector("#contributeForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = Number(inputAmount.value);

      if (isNaN(amount) || amount <= 0) {
        showToast("El monto debe ser estrictamente positivo", "warning");
        return;
      }

      if (amount > balance) {
        showToast("Saldo insuficiente para realizar el aporte", "warning");
        return;
      }

      isSubmitting = true;
      const submitBtn = root.querySelector("#btnSubmitContrib");
      if (submitBtn) submitBtn.disabled = true;

      try {
        await api.contributeToCow(cow.id, amount);
        showToast(`Aporte de ${formatCOP(amount)} confirmado en "${cow.title}"`, "success");
        closeModal();
        // Recargar saldo y vacas en paralelo
        await Promise.all([
          loadCows(),
          api.getBalance(store.getActiveUser().accountId).then((b) => store.setState({ balance: b.balance })),
        ]);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        isSubmitting = false;
      }
    });
  }

  // Modal 3: Confirmación de Desembolso (Liquidación)
  function openDisburseModal(cow) {
    activeModal = "disburse";
    selectedCow = cow;
    const root = getModalRoot();

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="font-size:18px;font-weight:600;margin:0;color:#111827;">Liquidación y Desembolso</h3>
            <button type="button" class="btnModalClose" style="background:none;border:none;cursor:pointer;color:#98A2B3;padding:4px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style="padding:16px;background:#EAF6EF;border:1px solid #C4E9D3;border-radius:8px;margin-bottom:16px;">
            <div style="font-size:13px;color:#16865B;margin-bottom:6px;font-weight:500;">
              Monto a transferir a tu cuenta personal:
            </div>
            <div class="tabular-nums" style="font-size:28px;font-weight:600;color:#16865B;">
              ${formatCOP(cow.collected_amount)}
            </div>
          </div>

          <p style="font-size:13px;color:#667085;line-height:1.5;margin:0 0 16px 0;">
            Al confirmar, el <strong>100% de los fondos acumulados</strong> en la cuenta custodia bóveda de <em>"${cow.title}"</em> serán transferidos atómicamente a tu cuenta corriente personal. La vaca cambiará su estado a <strong>DESEMBOLSADA</strong>.
          </p>

          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cancelar</button>
            <button type="button" id="btnConfirmDisburse" class="bank-btn" style="background-color:#16865B;color:#FFFFFF;" ${isSubmitting ? "disabled" : ""}>
              ${isSubmitting ? `<span class="bank-spinner"></span> Desembolsando...` : `Confirmar y Desembolsar`}
            </button>
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll(".btnModalClose").forEach((b) => b.addEventListener("click", closeModal));

    const btnConfirm = root.querySelector("#btnConfirmDisburse");
    btnConfirm.addEventListener("click", async () => {
      isSubmitting = true;
      btnConfirm.disabled = true;

      try {
        await api.disburseCow(cow.id);
        showToast(`Desembolso de ${formatCOP(cow.collected_amount)} ejecutado con éxito`, "success");
        closeModal();
        await Promise.all([
          loadCows(),
          api.getBalance(store.getActiveUser().accountId).then((b) => store.setState({ balance: b.balance })),
        ]);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        isSubmitting = false;
      }
    });
  }

  // Modal 4: Visualización de Miembros y Privacidad
  function openMembersModal(cow) {
    activeModal = "members";
    selectedCow = cow;
    const root = getModalRoot();
    const active = store.getActiveUser();
    const isAnonymous = cow.visibility_type === "ANONYMOUS";
    const members = cow.members || [];

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content" style="max-width:540px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <h3 style="font-size:18px;font-weight:600;margin:0;color:#111827;">Participantes de "${cow.title}"</h3>
                ${
                  isAnonymous
                    ? `<span class="badge badge-warning" style="font-size:11px;">Privada / Anónima</span>`
                    : `<span class="badge badge-success" style="font-size:11px;">Pública</span>`
                }
              </div>
              <span style="font-size:12px;color:#667085;">
                ${
                  isAnonymous
                    ? `Regla Zero-Trust: Cada aportante solo ve su propio monto. Los demás se resuelven como ocultos.`
                    : `Regla Pública: Todos los miembros pueden consultar los montos individuales aportados.`
                }
              </span>
            </div>
            <button type="button" class="btnModalClose" style="background:none;border:none;cursor:pointer;color:#98A2B3;padding:4px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Lista de Miembros con Aportes Autorizados -->
          <div style="border:1px solid #E5EAF0;border-radius:8px;overflow:hidden;margin-bottom:16px;">
            ${
              members.length === 0
                ? `<div style="padding:20px;text-align:center;color:#667085;font-size:13px;">No hay miembros registrados.</div>`
                : members
                    .map((m, idx) => {
                      const isMe = m.user_id === active.id;
                      const hasAmount = m.amount_contributed !== null && m.amount_contributed !== undefined;

                      return `
                      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:${idx === members.length - 1 ? "none" : "1px solid #F2F4F7"};background:${isMe ? "#F8FAFC" : "#FFFFFF"};">
                        <div>
                          <div style="display:flex;align-items:center;gap:6px;">
                            <strong style="font-size:13px;color:#111827;">${m.full_name}</strong>
                            ${isMe ? `<span class="badge badge-navy" style="font-size:10px;padding:1px 5px;">Tú</span>` : ""}
                            ${m.role === "CREATOR" ? `<span class="badge badge-info" style="font-size:10px;padding:1px 5px;">Creador</span>` : ""}
                          </div>
                          <span style="font-size:11px;color:#667085;">Vinculado: ${formatDate(m.joined_at)}</span>
                        </div>

                        <div style="text-align:right;">
                          ${
                            hasAmount
                              ? `<span class="tabular-nums" style="font-size:14px;font-weight:600;color:#16865B;">${formatCOP(m.amount_contributed)}</span>`
                              : `<span class="badge badge-warning" style="font-size:11px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> [Aporte Oculto]</span>`
                          }
                        </div>
                      </div>
                    `;
                    })
                    .join("")}
          </div>

          <!-- Total Consistente -->
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;margin-bottom:16px;">
            <span style="font-size:13px;font-weight:500;color:#475467;">Total Acumulado en Bóveda:</span>
            <strong class="tabular-nums" style="font-size:16px;color:#111827;">${formatCOP(cow.collected_amount)}</strong>
          </div>

          <div style="display:flex;justify-content:flex-end;">
            <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cerrar</button>
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll(".btnModalClose").forEach((b) => b.addEventListener("click", closeModal));
  }

  // Carga inicial y reactividad
  loadCows();
  render(store.getState());

  store.subscribe((state) => {
    // Si la vaca o usuario cambió, re-renderizar
    render(state);
  });
}
