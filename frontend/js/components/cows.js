/**
 * Módulo de Fondos Colaborativos ("Vacas") para HabiReto.
 * 
 * Gestiona la visualización de iniciativas ("Mis vacas" vs "Donde participo"),
 * creación con privacidad e invitados, aportes atómicos con validación de saldo,
 * liquidación por desembolso a la cuenta del creador y consulta de miembros con reglas Zero-Trust.
 */

import { api, formatCOP } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

/**
 * Recarga la lista de vacas desde el backend y actualiza el estado global.
 */
export async function reloadCows() {
  try {
    const cows = await api.listCows();
    store.setState({ cows, isLoading: false });
  } catch (err) {
    showToast(`Error al sincronizar vacas: ${err.message}`, "error");
  }
}

/**
 * Inicializa el módulo de fondos colaborativos en el contenedor DOM indicado.
 * 
 * @param {string} containerId - Identificador del nodo contenedor raíz.
 */
export function initCows(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Estado local de filtros del módulo
  let activeTabFilter = "all"; // 'all' | 'mine' | 'others'
  let searchQuery = "";
  let isSubmitting = false;

  async function loadCows() {
    await reloadCows();
  }

  /**
   * Renderiza la interfaz del módulo de Vacas en función del estado actual.
   * 
   * @param {Object} state - Estado reactivo de la aplicación.
   */
  function render(state) {
    const active = state.activeUser;
    const allCows = state.cows || [];
    const balance = state.balance || 0;

    // Clasificación estricta: Mis Vacas (creadas por el usuario activo) vs Otras Vacas
    const myCows = [];
    const otherCows = [];

    allCows.forEach((cow) => {
      const myMembership = (cow.members || []).find((m) => m.user_id === active.id);
      const isCreator = (myMembership && myMembership.role === "CREATOR") || (cow.creator_id && cow.creator_id === active.id);

      if (isCreator) {
        myCows.push(cow);
      } else {
        otherCows.push(cow);
      }
    });

    // Filtro por término de búsqueda (título o descripción)
    const filterBySearch = (list) => {
      if (!searchQuery.trim()) return list;
      const q = searchQuery.toLowerCase().trim();
      return list.filter(
        (c) =>
          (c.title && c.title.toLowerCase().includes(q)) ||
          (c.description && c.description.toLowerCase().includes(q))
      );
    };

    const filteredMyCows = filterBySearch(myCows);
    const filteredOtherCows = filterBySearch(otherCows);

    const showMine = activeTabFilter === "all" || activeTabFilter === "mine";
    const showOthers = activeTabFilter === "all" || activeTabFilter === "others";
    const cardGrid = (list, isMine) =>
      `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:16px;">
        ${list.map((cow) => renderCowCard(cow, active, isMine)).join("")}
      </div>`;

    // Una sola barra de control (filtros + búsqueda + crear) y dos secciones.
    // Se eliminan las tarjetas de métricas: los contadores ya están en las pestañas.
    container.innerHTML = `
      <div class="page">

        <div class="toolbar">
          <div class="cows-filter-tabs" role="tablist">
            <button type="button" class="cows-filter-tab ${activeTabFilter === "all" ? "active" : ""}" data-tab="all">
              Todas <span class="cows-tab-count">${allCows.length}</span>
            </button>
            <button type="button" class="cows-filter-tab ${activeTabFilter === "mine" ? "active" : ""}" data-tab="mine">
              Mías <span class="cows-tab-count">${myCows.length}</span>
            </button>
            <button type="button" class="cows-filter-tab ${activeTabFilter === "others" ? "active" : ""}" data-tab="others">
              Invitado <span class="cows-tab-count">${otherCows.length}</span>
            </button>
          </div>

          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <input type="search" id="cowSearchInput" class="bank-input search-input" placeholder="Buscar" aria-label="Buscar vacas por nombre" value="${searchQuery}" />
            <button type="button" id="btnOpenCreateCow" class="bank-btn bank-btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nueva vaca
            </button>
          </div>
        </div>

        ${
          showMine
            ? `
            <section>
              <div class="cows-section-header">
                <h2 class="cows-section-title">Mis vacas</h2>
              </div>
              ${
                filteredMyCows.length === 0
                  ? `<div class="bank-empty-state">
                      <div class="muted" style="margin-bottom:14px;">Aún no has creado ninguna vaca.</div>
                      <button type="button" class="bank-btn bank-btn-secondary bank-btn-sm btnTriggerCreateCow">Crear vaca</button>
                    </div>`
                  : cardGrid(filteredMyCows, true)
              }
            </section>
          `
            : ""
        }

        ${
          showOthers
            ? `
            <section>
              <div class="cows-section-header">
                <h2 class="cows-section-title">Donde participo</h2>
              </div>
              ${
                filteredOtherCows.length === 0
                  ? `<div class="bank-empty-state"><div class="muted">Cuando alguien te invite, su vaca aparecerá aquí.</div></div>`
                  : cardGrid(filteredOtherCows, false)
              }
            </section>
          `
            : ""
        }

        <!-- Contenedor dinámico de Modales -->
        <div id="cowModalRoot"></div>

      </div>
    `;

    // ------------------------------------------------------------------------
    // Enlace de Eventos del Módulo
    // ------------------------------------------------------------------------

    // Pestañas de filtrado (Todas / Mis Vacas / Otras Vacas)
    container.querySelectorAll(".cows-filter-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTabFilter = btn.getAttribute("data-tab");
        render(store.getState());
      });
    });

    // Input de búsqueda en vivo
    const searchInput = container.querySelector("#cowSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        render(store.getState());
        // Restaurar foco al final del input tras re-renderizado
        const refreshedInput = container.querySelector("#cowSearchInput");
        if (refreshedInput) {
          refreshedInput.focus();
          refreshedInput.setSelectionRange(searchQuery.length, searchQuery.length);
        }
      });
    }

    // Botones para abrir modal de creación
    const btnOpenCreateCow = container.querySelector("#btnOpenCreateCow");
    if (btnOpenCreateCow) {
      btnOpenCreateCow.addEventListener("click", () => openCreateModal());
    }
    container.querySelectorAll(".btnTriggerCreateCow").forEach((b) => {
      b.addEventListener("click", () => openCreateModal());
    });

    // Acciones de tarjetas
    container.querySelectorAll(".btnViewMembers").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const cowId = e.currentTarget.getAttribute("data-id");
        const cow = allCows.find((c) => c.id === cowId);
        if (cow) openMembersModal(cow);
      });
    });

    container.querySelectorAll(".btnOpenContribute").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const cowId = e.currentTarget.getAttribute("data-id");
        const cow = allCows.find((c) => c.id === cowId);
        if (cow) openContributeModal(cow);
      });
    });

    container.querySelectorAll(".btnOpenDisburse").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const cowId = e.currentTarget.getAttribute("data-id");
        const cow = allCows.find((c) => c.id === cowId);
        if (cow) openDisburseModal(cow);
      });
    });
  }

  /**
   * Renderiza una tarjeta individual de Vaca adaptada según si es propia o ajena.
   * 
   * @param {Object} cow - Objeto del fondo colaborativo.
   * @param {Object} activeUser - Usuario activo en sesión.
   * @param {boolean} isMine - Indica si el usuario activo es el creador.
   */
  function renderCowCard(cow, activeUser, isMine) {
    const isAnonymous = cow.visibility_type === "ANONYMOUS";
    const isCompleted = cow.status === "COMPLETED";
    const isDisbursed = cow.status === "DISBURSED";
    const isCancelled = cow.status === "CANCELLED";
    const isActive = cow.status === "ACTIVE";

    const progress = Math.min(100, Math.round((cow.collected_amount / cow.target_amount) * 100));
    const remaining = Math.max(0, cow.target_amount - cow.collected_amount);

    const canDisburse = isMine && (isActive || isCompleted) && cow.collected_amount > 0;
    const canContribute = (isActive || isCompleted) && !isDisbursed && !isCancelled;

    // Resolver nombre del creador si no es propia
    const creatorMember = (cow.members || []).find((m) => m.role === "CREATOR");
    const creatorName = creatorMember ? creatorMember.full_name : "Organizador";

    // Solo se muestra un estado cuando NO es el habitual (activa), para no repetir
    // una insignia idéntica en cada tarjeta.
    const statusBadge = isDisbursed
      ? `<span class="badge badge-navy">Desembolsada</span>`
      : isCompleted
      ? `<span class="badge badge-success">Meta lograda</span>`
      : isCancelled
      ? `<span class="badge badge-danger">Cancelada</span>`
      : "";

    const memberCount = (cow.members || []).length;

    return `
      <article class="cow-card">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;">
            <h3 style="font-size:16px;font-weight:700;color:#0F172A;margin:0;">${cow.title}</h3>
            ${statusBadge}
          </div>
          <div class="muted" style="display:flex;align-items:center;gap:6px;margin-bottom:18px;">
            ${
              isAnonymous
                ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Anónima`
                : "Pública"
            }
            · ${isMine ? "Creada por ti" : `De ${creatorName.split(" ")[0]}`}
          </div>

          <div class="kv" style="margin-bottom:8px;">
            <span class="tabular-nums" style="font-size:20px;font-weight:700;color:#0F172A;">${formatCOP(cow.collected_amount)}</span>
            <span class="muted tabular-nums">de ${formatCOP(cow.target_amount)}</span>
          </div>
          <div class="bank-progress-track" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
            <div class="bank-progress-bar ${progress >= 100 ? "completed" : ""}" style="width:${progress}%;"></div>
          </div>
          <div class="muted tabular-nums" style="margin-top:8px;">
            ${remaining > 0 ? `Faltan ${formatCOP(remaining)}` : "Meta lograda"}
            ${cow.my_contribution > 0 ? ` · Tu aporte ${formatCOP(cow.my_contribution)}` : ""}
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-top:20px;">
          <button type="button" class="bank-btn bank-btn-secondary bank-btn-sm btnViewMembers" data-id="${cow.id}" style="flex:1;">
            Participantes (${memberCount})
          </button>
          ${
            canContribute
              ? `<button type="button" class="bank-btn bank-btn-primary bank-btn-sm btnOpenContribute" data-id="${cow.id}" style="flex:1;">Aportar</button>`
              : ""
          }
          ${
            canDisburse
              ? `<button type="button" class="bank-btn bank-btn-success bank-btn-sm btnOpenDisburse" data-id="${cow.id}" style="flex:1;">Desembolsar</button>`
              : ""
          }
        </div>
      </article>
    `;
  }

  // ------------------------------------------------------------------------
  // MODALES DEL SISTEMA (Crear Vaca, Aportar, Desembolsar, Participantes)
  // ------------------------------------------------------------------------

  function getModalRoot() {
    return container.querySelector("#cowModalRoot");
  }

  function closeModal() {
    const root = getModalRoot();
    if (root) root.innerHTML = "";
  }

  /**
   * Modal 1: Creación de Vaca (nombre, meta, privacidad e invitados).
   */
  function openCreateModal() {
    const root = getModalRoot();
    const active = store.getActiveUser();
    const availableContacts = store.getUsers().filter((u) => u.id !== active.id);

    let selectedVisibility = "PUBLIC"; // 'PUBLIC' | 'ANONYMOUS'

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content">
          
          <div class="modal-head">
            <h3 class="modal-title">Nueva vaca</h3>
            <button type="button" class="btn-icon btnModalClose" aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <form id="createCowForm" class="stack-md">
            <div>
              <label class="bank-label" for="cowTitle">Nombre</label>
              <input id="cowTitle" class="bank-input" type="text" placeholder="Ej. Viaje a Cartagena" required maxlength="120" />
            </div>

            <div>
              <label class="bank-label" for="cowTargetAmount">Meta (COP)</label>
              <input id="cowTargetAmount" class="bank-input tabular-nums" type="number" min="1" step="any" placeholder="0" required />
              <div class="chips" style="margin-top:8px;">
                <button type="button" class="bank-btn-chip btnPresetTarget" data-val="100000">$100.000</button>
                <button type="button" class="bank-btn-chip btnPresetTarget" data-val="500000">$500.000</button>
                <button type="button" class="bank-btn-chip btnPresetTarget" data-val="1000000">$1.000.000</button>
              </div>
            </div>

            <div>
              <label class="bank-label" for="cowDescription">Descripción (opcional)</label>
              <textarea id="cowDescription" class="bank-textarea" rows="2" maxlength="255"></textarea>
            </div>

            <!-- Privacidad: dos opciones con una sola línea explicativa cada una -->
            <div>
              <span class="bank-label">Privacidad</span>
              <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;">
                <div class="privacy-option-card selected" id="optPrivacyPublic" data-val="PUBLIC" role="radio" aria-checked="true" tabindex="0">
                  <div class="privacy-radio-circle"></div>
                  <div>
                    <div style="font-weight:600;font-size:14px;color:#0F172A;">Pública</div>
                    <div class="muted" style="font-size:12px;">Todos ven los aportes.</div>
                  </div>
                </div>
                <div class="privacy-option-card" id="optPrivacyAnonymous" data-val="ANONYMOUS" role="radio" aria-checked="false" tabindex="0">
                  <div class="privacy-radio-circle"></div>
                  <div>
                    <div style="font-weight:600;font-size:14px;color:#0F172A;">Anónima</div>
                    <div class="muted" style="font-size:12px;">Cada quien ve solo su aporte.</div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div class="kv" style="margin-bottom:6px;">
                <span class="bank-label" style="margin:0;">Invitar</span>
                <div style="display:flex;gap:12px;">
                  <button type="button" id="btnSelectAllContacts" class="btn-link">Todos</button>
                  <button type="button" id="btnUnselectAllContacts" class="btn-link" style="color:#64748B;">Ninguno</button>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;">
                ${
                  availableContacts.length === 0
                    ? `<span class="muted">No hay otras personas registradas.</span>`
                    : availableContacts
                        .map(
                          (c) => `
                          <label class="contact-invite-row checked">
                            <span style="display:flex;align-items:center;gap:10px;">
                              <input type="checkbox" class="cowInviteCheckbox" value="${c.id}" checked style="width:16px;height:16px;accent-color:#173B63;cursor:pointer;" />
                              <span style="font-size:14px;font-weight:600;color:#0F172A;">${c.name}</span>
                            </span>
                            <span class="muted tabular-nums" style="font-size:12px;">${c.phone}</span>
                          </label>
                        `
                        )
                        .join("")
                }
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cancelar</button>
              <button type="submit" id="btnSubmitCreateCow" class="bank-btn bank-btn-primary" ${isSubmitting ? "disabled" : ""}>
                ${isSubmitting ? `<span class="bank-spinner"></span> Creando…` : "Crear vaca"}
              </button>
            </div>

          </form>
        </div>
      </div>
    `;

    // Cerrar modal
    root.querySelectorAll(".btnModalClose").forEach((b) => b.addEventListener("click", closeModal));

    // Preset targets
    const inputTarget = root.querySelector("#cowTargetAmount");
    root.querySelectorAll(".btnPresetTarget").forEach((chip) => {
      chip.addEventListener("click", () => {
        inputTarget.value = chip.getAttribute("data-val");
      });
    });

    // Control de selección de privacidad
    const optPublic = root.querySelector("#optPrivacyPublic");
    const optAnonymous = root.querySelector("#optPrivacyAnonymous");

    function setPrivacy(type) {
      selectedVisibility = type;
      optPublic.classList.toggle("selected", type === "PUBLIC");
      optAnonymous.classList.toggle("selected", type === "ANONYMOUS");
      optPublic.setAttribute("aria-checked", String(type === "PUBLIC"));
      optAnonymous.setAttribute("aria-checked", String(type === "ANONYMOUS"));
    }

    // Clic o Enter/Espacio seleccionan la opción (accesible por teclado).
    [optPublic, optAnonymous].forEach((opt) => {
      if (!opt) return;
      const select = () => setPrivacy(opt.getAttribute("data-val"));
      opt.addEventListener("click", select);
      opt.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      });
    });

    // Seleccionar / Deseleccionar todos los contactos
    const btnSelectAll = root.querySelector("#btnSelectAllContacts");
    const btnUnselectAll = root.querySelector("#btnUnselectAllContacts");
    const checkboxes = root.querySelectorAll(".cowInviteCheckbox");

    if (btnSelectAll) {
      btnSelectAll.addEventListener("click", () => {
        checkboxes.forEach((cb) => {
          cb.checked = true;
          cb.closest(".contact-invite-row")?.classList.add("checked");
        });
      });
    }

    if (btnUnselectAll) {
      btnUnselectAll.addEventListener("click", () => {
        checkboxes.forEach((cb) => {
          cb.checked = false;
          cb.closest(".contact-invite-row")?.classList.remove("checked");
        });
      });
    }

    // Toggle visual de checkbox
    checkboxes.forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const row = e.target.closest(".contact-invite-row");
        if (row) {
          if (e.target.checked) row.classList.add("checked");
          else row.classList.remove("checked");
        }
      });
    });

    // Envío del formulario
    const form = root.querySelector("#createCowForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = root.querySelector("#cowTitle").value.trim();
      const desc = root.querySelector("#cowDescription").value.trim();
      const target = Number(inputTarget.value);

      const inviteCheckboxes = root.querySelectorAll(".cowInviteCheckbox:checked");
      const invitedUserIds = Array.from(inviteCheckboxes).map((cb) => cb.value);

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
        await api.createCow(title, desc, target, selectedVisibility, null, invitedUserIds);
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

  /**
   * Modal 2: Aporte a una Vaca con validación reactiva de saldo.
   */
  function openContributeModal(cow) {
    const root = getModalRoot();
    const balance = store.getState().balance || 0;
    const remaining = Math.max(0, cow.target_amount - cow.collected_amount);

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content">
          <div class="modal-head">
            <h3 class="modal-title">Aportar a ${cow.title}</h3>
            <button type="button" class="btn-icon btnModalClose" aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style="margin-bottom:20px;">
            <div class="kv"><span class="muted">Tu saldo</span><strong class="tabular-nums">${formatCOP(balance)}</strong></div>
            <div class="kv"><span class="muted">Falta para la meta</span><strong class="tabular-nums">${formatCOP(remaining)}</strong></div>
          </div>

          <form id="contributeForm">
            <label class="bank-label" for="contribAmount">Monto</label>
            <input id="contribAmount" class="bank-input tabular-nums" type="number" min="1" step="any" placeholder="0" required />
            <div class="chips" style="margin-top:8px;">
              <button type="button" class="bank-btn-chip btnPresetContrib" data-val="10000">$10.000</button>
              <button type="button" class="bank-btn-chip btnPresetContrib" data-val="50000">$50.000</button>
              ${remaining > 0 ? `<button type="button" class="bank-btn-chip btnPresetContrib" data-val="${remaining}">Completar meta</button>` : ""}
            </div>

            <div class="modal-actions">
              <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cancelar</button>
              <button type="submit" id="btnSubmitContrib" class="bank-btn bank-btn-primary" ${isSubmitting ? "disabled" : ""}>
                ${isSubmitting ? `<span class="bank-spinner"></span> Procesando…` : "Aportar"}
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
        showToast("Saldo insuficiente en tu cuenta personal", "warning");
        return;
      }

      isSubmitting = true;
      const submitBtn = root.querySelector("#btnSubmitContrib");
      if (submitBtn) submitBtn.disabled = true;

      try {
        await api.contributeToCow(cow.id, amount);
        showToast(`Aporte de ${formatCOP(amount)} acreditado en "${cow.title}"`, "success");
        closeModal();
        store.setState({ balance: Math.max(0, balance - amount) });
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

  /**
   * Modal 3: Liquidación y Desembolso hacia la cuenta personal del Creador.
   */
  function openDisburseModal(cow) {
    const root = getModalRoot();

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content">
          <div class="modal-head">
            <h3 class="modal-title">Desembolsar ${cow.title}</h3>
            <button type="button" class="btn-icon btnModalClose" aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <p class="muted" style="margin:0 0 4px;">Se transferirá a tu cuenta</p>
          <div class="tabular-nums" style="font-size:32px;font-weight:700;color:#0F172A;">${formatCOP(cow.collected_amount)}</div>

          <div class="modal-actions">
            <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cancelar</button>
            <button type="button" id="btnConfirmDisburse" class="bank-btn bank-btn-success" ${isSubmitting ? "disabled" : ""}>
              ${isSubmitting ? `<span class="bank-spinner"></span> Desembolsando…` : "Desembolsar"}
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

  /**
   * Modal 4: Visualización de Miembros y Aplicación de Reglas Zero-Trust.
   */
  function openMembersModal(cow) {
    const root = getModalRoot();
    const active = store.getActiveUser();
    const isAnonymous = cow.visibility_type === "ANONYMOUS";
    const members = cow.members || [];

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content" style="max-width:540px;">
          <div class="modal-head">
            <div>
              <h3 class="modal-title">Participantes</h3>
              <span class="muted">${cow.title} · ${isAnonymous ? "Anónima: solo ves tu aporte" : "Pública"}</span>
            </div>
            <button type="button" class="btn-icon btnModalClose" aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="row-list">
            ${
              members.length === 0
                ? `<div class="row-item muted">Sin participantes.</div>`
                : members
                    .map((m) => {
                      const isMe = m.user_id === active.id;
                      const hasAmount = m.amount_contributed !== null && m.amount_contributed !== undefined;
                      return `
                      <div class="row-item">
                        <span style="display:flex;align-items:center;gap:10px;">
                          <span class="avatar ${isMe ? "avatar-active" : ""}">${(m.full_name || "US").slice(0, 2).toUpperCase()}</span>
                          <span>
                            <strong style="font-weight:600;">${m.full_name}</strong>
                            <span class="muted">${[isMe ? "Tú" : "", m.role === "CREATOR" ? "Creador" : ""].filter(Boolean).join(" · ")}</span>
                          </span>
                        </span>
                        ${
                          hasAmount
                            ? `<strong class="tabular-nums">${formatCOP(m.amount_contributed)}</strong>`
                            : `<span class="muted" title="Aporte oculto por privacidad">Oculto</span>`
                        }
                      </div>
                    `;
                    })
                    .join("")
            }
          </div>

          <div class="kv" style="margin-top:16px;padding:0 4px;">
            <span class="muted">Total</span>
            <strong class="tabular-nums" style="font-size:16px;">${formatCOP(cow.collected_amount)}</strong>
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll(".btnModalClose").forEach((b) => b.addEventListener("click", closeModal));
  }

  // Carga inicial y reactividad
  let currentUserId = store.getActiveUser()?.id;
  loadCows();
  render(store.getState());

  store.subscribe((state) => {
    const newUserId = state.activeUser?.id;
    if (newUserId && newUserId !== currentUserId) {
      currentUserId = newUserId;
      loadCows();
    }
    render(state);
  });
}