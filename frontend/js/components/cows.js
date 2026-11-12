/**
 * Módulo de Fondos Colaborativos ("Vaquitas") para HabiReto.
 * 
 * Gestiona la visualización de iniciativas ("Mis vaquitas" vs "Donde participo"),
 * creación con privacidad e invitación por llave única (@ABC123), aportes atómicos con
 * validación de saldo, liquidación ("Terminar Vaquita") y consulta con reglas Zero-Trust.
 */

import { api, formatCOP, formatDate } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

/**
 * Recarga la lista de vaquitas desde el backend y actualiza el estado global.
 */
export async function reloadCows() {
  try {
    const cows = await api.listCows();
    store.setState({ cows, isLoading: false });
  } catch (err) {
    showToast(`Error al sincronizar vaquitas: ${err.message}`, "error");
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
            <input type="search" id="cowSearchInput" class="bank-input search-input" placeholder="Buscar" aria-label="Buscar vaquitas por nombre" value="${searchQuery}" />
            <button type="button" id="btnOpenCreateCow" class="bank-btn bank-btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nueva vaquita
            </button>
          </div>
        </div>

        ${
          showMine
            ? `
            <section>
              <div class="cows-section-header">
                <h2 class="cows-section-title">Mis vaquitas</h2>
              </div>
              ${
                filteredMyCows.length === 0
                  ? `<div class="bank-empty-state">
                      <div class="muted" style="margin-bottom:14px;">Aún no has creado ninguna vaquita.</div>
                      <button type="button" class="bank-btn bank-btn-secondary bank-btn-sm btnTriggerCreateCow">Crear vaquita</button>
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
                  ? `<div class="bank-empty-state"><div class="muted">Cuando alguien te invite con tu llave, su vaquita aparecerá aquí.</div></div>`
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
    const creatorName = cow.creator_name || (creatorMember ? creatorMember.full_name : "Organizador");

    // Solo se muestra un estado cuando NO es el habitual (activa), para no repetir
    // una insignia idéntica en cada tarjeta.
    const statusBadge = isDisbursed
      ? `<span class="badge badge-navy">Terminada</span>`
      : isCompleted
      ? `<span class="badge badge-success">Meta lograda</span>`
      : isCancelled
      ? `<span class="badge badge-danger">Cancelada</span>`
      : "";

    const memberCount = (cow.members || []).length;
    const contributions = cow.contributions || [];
    const latestContribution = contributions[0] || null;

    // Etiqueta del botón de detalle según el caso (Vaca Pública vs Privada y Creador vs Invitado)
    const detailBtnLabel = isAnonymous
      ? isMine
        ? `Invitados (${memberCount})`
        : `Aportes (${contributions.length})`
      : isMine
      ? `Invitados (${memberCount})`
      : `Aportes (${memberCount})`;

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
                ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Privada`
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
          ${
            isAnonymous && latestContribution
              ? `<div class="tabular-nums" style="margin-top:10px;padding:8px 10px;border-radius:8px;background:var(--color-surface-subtle);border:1px solid var(--color-border-subtle);font-size:13px;color:var(--color-text-primary);">
                  <span class="amount-credit" style="font-weight:700;">+</span>
                  Alguien ha aportado <strong>${formatCOP(latestContribution.amount)}</strong>
                  ${contributions.length > 1 ? `<span class="muted"> (+${contributions.length - 1} más)</span>` : ""}
                </div>`
              : ""
          }
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:20px;">
          <button type="button" class="bank-btn bank-btn-secondary bank-btn-sm btnViewMembers" data-id="${cow.id}" style="flex:1 1 calc(50% - 4px);">
            ${detailBtnLabel}
          </button>
          ${
            canContribute
              ? `<button type="button" class="bank-btn bank-btn-primary bank-btn-sm btnOpenContribute" data-id="${cow.id}" style="flex:1 1 calc(50% - 4px);">Aportar</button>`
              : ""
          }
          ${
            canDisburse
              ? `<button type="button" class="bank-btn bank-btn-success bank-btn-sm btnOpenDisburse" data-id="${cow.id}" style="flex:1 1 100%;">Terminar Vaquita</button>`
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
   * Modal 1: Creación de Vaquita (nombre, meta, privacidad e invitados por llave @ABC123).
   */
  function openCreateModal() {
    const root = getModalRoot();
    const active = store.getActiveUser();

    let selectedVisibility = "PUBLIC"; // 'PUBLIC' | 'ANONYMOUS'
    const invitedKeys = [];

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content">
          
          <div class="modal-head">
            <h3 class="modal-title">Nueva vaquita</h3>
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
            </div>

            <div>
              <label class="bank-label" for="cowDescription">Descripción (opcional)</label>
              <textarea id="cowDescription" class="bank-textarea" rows="2" maxlength="255"></textarea>
            </div>

            <!-- Privacidad: dos casos claramente diferenciados -->
            <div>
              <span class="bank-label">Tipo de vaquita</span>
              <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;">
                <div class="privacy-option-card selected" id="optPrivacyPublic" data-val="PUBLIC" role="radio" aria-checked="true" tabindex="0">
                  <div class="privacy-radio-circle"></div>
                  <div>
                    <div style="font-weight:600;font-size:14px;color:#0F172A;">Pública</div>
                    <div class="muted" style="font-size:12px;">Ves todos tus invitados; ellos ven los aportes realizados.</div>
                  </div>
                </div>
                <div class="privacy-option-card" id="optPrivacyAnonymous" data-val="ANONYMOUS" role="radio" aria-checked="false" tabindex="0">
                  <div class="privacy-radio-circle"></div>
                  <div>
                    <div style="font-weight:600;font-size:14px;color:#0F172A;">Privada</div>
                    <div class="muted" style="font-size:12px;">Solo tú ves los invitados; los aportes se ven anónimos.</div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label class="bank-label" for="inviteKeyInput">Invitar con llave única (@ABC123)</label>
              <div style="display:flex;gap:8px;">
                <input id="inviteKeyInput" class="bank-input tabular-nums" type="text" placeholder="Ej. @BOB222" maxlength="7" />
                <button type="button" id="btnAddInviteKey" class="bank-btn bank-btn-secondary" style="white-space:nowrap;">Agregar</button>
              </div>
              <div id="invitedKeysContainer" class="chips" style="margin-top:8px;"></div>
            </div>

            <div class="modal-actions">
              <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cancelar</button>
              <button type="submit" id="btnSubmitCreateCow" class="bank-btn bank-btn-primary" ${isSubmitting ? "disabled" : ""}>
                ${isSubmitting ? `<span class="bank-spinner"></span> Creando…` : "Crear vaquita"}
              </button>
            </div>

          </form>
        </div>
      </div>
    `;

    // Cerrar modal
    root.querySelectorAll(".btnModalClose").forEach((b) => b.addEventListener("click", closeModal));

    const inputTarget = root.querySelector("#cowTargetAmount");
    const inviteKeyInput = root.querySelector("#inviteKeyInput");
    const btnAddInviteKey = root.querySelector("#btnAddInviteKey");
    const invitedKeysContainer = root.querySelector("#invitedKeysContainer");

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

    function renderInvitedKeys() {
      if (!invitedKeysContainer) return;
      if (invitedKeys.length === 0) {
        invitedKeysContainer.innerHTML = `<span class="muted" style="font-size:12px;">Sin llaves invitadas aún.</span>`;
        return;
      }
      invitedKeysContainer.innerHTML = invitedKeys
        .map(
          (k) => `
          <button type="button" class="bank-btn-chip btnRemoveInviteKey tabular-nums" data-key="${k}" title="Quitar ${k}">
            ${k} ×
          </button>
        `
        )
        .join("");

      invitedKeysContainer.querySelectorAll(".btnRemoveInviteKey").forEach((btn) => {
        btn.addEventListener("click", () => {
          const keyToRemove = btn.getAttribute("data-key");
          const idx = invitedKeys.indexOf(keyToRemove);
          if (idx !== -1) {
            invitedKeys.splice(idx, 1);
            renderInvitedKeys();
          }
        });
      });
    }

    function tryAddKey(rawVal, silentIfEmpty = false) {
      let clean = (rawVal || "").trim().toUpperCase();
      if (!clean) {
        if (!silentIfEmpty) showToast("Escribe una llave @ABC123 para agregar", "warning");
        return true;
      }
      if (!clean.startsWith("@")) {
        clean = `@${clean}`;
      }
      if (!/^@[A-Z]{3}[0-9]{3}$/.test(clean)) {
        showToast("La llave debe iniciar con @ seguida de 3 letras y 3 números (ej. @BOB222)", "warning");
        return false;
      }
      if (active.userKey && clean === active.userKey.toUpperCase()) {
        showToast("Ya eres el creador de esta vaquita", "warning");
        return false;
      }
      if (!invitedKeys.includes(clean)) {
        invitedKeys.push(clean);
        renderInvitedKeys();
      }
      if (inviteKeyInput) inviteKeyInput.value = "";
      return true;
    }

    renderInvitedKeys();

    if (btnAddInviteKey && inviteKeyInput) {
      btnAddInviteKey.addEventListener("click", () => {
        tryAddKey(inviteKeyInput.value, false);
        inviteKeyInput.focus();
      });
      inviteKeyInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          tryAddKey(inviteKeyInput.value, false);
        }
      });
    }

    // Envío del formulario
    const form = root.querySelector("#createCowForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = root.querySelector("#cowTitle").value.trim();
      const desc = root.querySelector("#cowDescription").value.trim();
      const target = Number(inputTarget.value);

      if (inviteKeyInput && inviteKeyInput.value.trim()) {
        const addedOk = tryAddKey(inviteKeyInput.value, true);
        if (!addedOk) return;
      }

      if (!title) {
        showToast("El nombre de la vaquita es obligatorio", "warning");
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
        await api.createCow(title, desc, target, selectedVisibility, null, invitedKeys);
        showToast(`Vaquita "${title}" creada exitosamente`, "success");
        closeModal();
        await loadCows();
      } catch (err) {
        showToast(err.message, "error");
        if (submitBtn) submitBtn.disabled = false;
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
   * Modal 3: Liquidación ("Terminar Vaquita") hacia la cuenta personal del Creador.
   */
  function openDisburseModal(cow) {
    const root = getModalRoot();

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content">
          <div class="modal-head">
            <h3 class="modal-title">Terminar Vaquita: ${cow.title}</h3>
            <button type="button" class="btn-icon btnModalClose" aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <p class="muted" style="margin:0 0 4px;">Se transferirá a tu cuenta</p>
          <div class="tabular-nums" style="font-size:32px;font-weight:700;color:#0F172A;">${formatCOP(cow.collected_amount)}</div>

          <div class="modal-actions">
            <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cancelar</button>
            <button type="button" id="btnConfirmDisburse" class="bank-btn bank-btn-success" ${isSubmitting ? "disabled" : ""}>
              ${isSubmitting ? `<span class="bank-spinner"></span> Terminando…` : "Terminar Vaquita"}
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
        showToast(`Vaquita terminada: ${formatCOP(cow.collected_amount)} transferidos a tu cuenta`, "success");
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
   * Modal 4: Visualización separada para Vaca Pública vs Vaca Privada.
   *
   * - Vaca Pública (PUBLIC):
   *   - Creador: ve a todas las personas invitadas (incluso en $0) y cuánto ha aportado cada una.
   *   - Invitado: solo ve los aportes de quienes ya han contribuido (> $0) con nombre y monto.
   * - Vaca Privada (ANONYMOUS):
   *   - Creador: ve la lista de personas invitadas (sin montos individuales) + el listado de
   *     aportes anónimos ("Alguien ha aportado $60.000").
   *   - Invitado: NO ve quiénes fueron invitados; solo mira cómo se llena la vaca con cada
   *     mensaje "Alguien ha aportado $60.000".
   */
  function openMembersModal(cow) {
    const root = getModalRoot();
    const active = store.getActiveUser();
    const isAnonymous = cow.visibility_type === "ANONYMOUS";
    const myMembership = (cow.members || []).find((m) => m.user_id === active.id);
    const isCreator =
      (cow.creator_id && cow.creator_id === active.id) ||
      Boolean(myMembership && myMembership.role === "CREATOR");

    const members = cow.members || [];
    const contributions = cow.contributions || [];

    const modalTitle = isAnonymous
      ? isCreator
        ? "Invitados y aportes"
        : "Aportes en la vaquita"
      : isCreator
      ? "Personas invitadas"
      : "Aportes realizados";

    const modalSubtitle = isAnonymous
      ? isCreator
        ? `${cow.title} · Privada · Solo tú ves quiénes están invitados`
        : `${cow.title} · Privada · Los aportes son anónimos`
      : isCreator
      ? `${cow.title} · Pública · Ves el aporte de cada invitado`
      : `${cow.title} · Pública · Aportes de los participantes`;

    let bodyHtml = "";

    if (!isAnonymous) {
      // CASO 1: VACA PÚBLICA
      bodyHtml = `
        <div class="row-list">
          ${
            members.length === 0
              ? `<div class="row-item muted">Aún nadie ha realizado aportes.</div>`
              : members
                  .map((m) => {
                    const isMe = m.user_id === active.id;
                    const amount = m.amount_contributed || 0;
                    return `
                      <div class="row-item">
                        <span style="display:flex;align-items:center;gap:10px;">
                          <span class="avatar ${isMe ? "avatar-active" : ""}">${(m.full_name || "US").slice(0, 2).toUpperCase()}</span>
                          <span>
                            <strong style="font-weight:600;">${m.full_name}</strong>
                            <span class="muted">${[isMe ? "Tú" : "", m.role === "CREATOR" ? "Creador" : ""].filter(Boolean).join(" · ")}</span>
                          </span>
                        </span>
                        <strong class="tabular-nums ${amount > 0 ? "amount-credit" : "muted"}">
                          ${amount > 0 ? formatCOP(amount) : "Sin aporte ($0)"}
                        </strong>
                      </div>
                    `;
                  })
                  .join("")
          }
        </div>
      `;
    } else {
      // CASO 2: VACA PRIVADA (ANÓNIMA)
      const contributionsListHtml = `
        <div>
          ${isCreator ? `<div class="bank-label" style="margin-bottom:8px;">Cómo se va llenando (${contributions.length})</div>` : ""}
          <div class="row-list">
            ${
              contributions.length === 0
                ? `<div class="row-item muted">Aún no se han recibido aportes.</div>`
                : contributions
                    .map(
                      (c) => `
                      <div class="row-item">
                        <span style="display:flex;align-items:center;gap:10px;">
                          <span class="avatar" style="background:var(--color-success-bg);color:var(--color-success);">+</span>
                          <span>
                            Alguien ha aportado <strong class="tabular-nums">${formatCOP(c.amount)}</strong>
                          </span>
                        </span>
                        <span class="muted tabular-nums" style="font-size:12px;">${formatDate(c.created_at)}</span>
                      </div>
                    `
                    )
                    .join("")
            }
          </div>
        </div>
      `;

      const creatorInviteesHtml = isCreator
        ? `
          <div>
            <div class="bank-label" style="margin-bottom:8px;">Personas invitadas (${members.length})</div>
            <div class="row-list">
              ${members
                .map((m) => {
                  const isMe = m.user_id === active.id;
                  return `
                    <div class="row-item">
                      <span style="display:flex;align-items:center;gap:10px;">
                        <span class="avatar ${isMe ? "avatar-active" : ""}">${(m.full_name || "US").slice(0, 2).toUpperCase()}</span>
                        <span>
                          <strong style="font-weight:600;">${m.full_name}</strong>
                          <span class="muted">${[isMe ? "Tú" : "", m.role === "CREATOR" ? "Creador" : "Invitado"].filter(Boolean).join(" · ")}</span>
                        </span>
                      </span>
                      <span class="muted" style="font-size:12px;">${isMe && m.amount_contributed !== null ? `Tu aporte: ${formatCOP(m.amount_contributed)}` : "Monto anónimo"}</span>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        `
        : "";

      bodyHtml = `<div class="stack-md">${contributionsListHtml}${creatorInviteesHtml}</div>`;
    }

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content" style="max-width:540px;">
          <div class="modal-head">
            <div>
              <h3 class="modal-title">${modalTitle}</h3>
              <span class="muted">${modalSubtitle}</span>
            </div>
            <button type="button" class="btn-icon btnModalClose" aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          ${bodyHtml}

          <div class="kv" style="margin-top:16px;padding:0 4px;">
            <span class="muted">Total recaudado</span>
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