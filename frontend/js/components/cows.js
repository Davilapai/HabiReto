/**
 * Módulo de Fondos Colaborativos ("Vacas") para HabiReto.
 * 
 * Gestiona la visualización jerárquica de iniciativas financieras ("Mis Vacas" vs "Otras Vacas"),
 * creación asistida con vista previa en vivo, aportes atómicos con validación de saldo,
 * liquidación por desembolso a la cuenta del creador y consulta de miembros con reglas Zero-Trust.
 */

import { api, formatCOP, formatDate } from "../api.js";
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

    // Métricas de resumen financiero
    const totalCollectedInMyCows = myCows.reduce((acc, c) => acc + (c.collected_amount || 0), 0);
    const totalMyContributions = allCows.reduce((acc, c) => acc + (c.my_contribution || 0), 0);
    const activeCowsCount = allCows.filter((c) => c.status === "ACTIVE" || c.status === "COMPLETED").length;

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;">
        
        <!-- Cabecera del Módulo con Resumen Estadístico y Botón de Creación -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
          <div>
            <h1 style="font-size:24px;font-weight:700;color:#0F172A;margin:0 0 4px 0;letter-spacing:-0.4px;">
              Fondos Colaborativos ("Vacas")
            </h1>
            <p style="font-size:14px;color:#64748B;margin:0;">
              Ahorro grupal con cuentas bóveda dedicadas, partida doble y privacidad Zero-Trust.
            </p>
          </div>
          <button type="button" id="btnOpenCreateCow" class="bank-btn bank-btn-primary" style="padding:10px 18px;font-size:14px;gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Crear Nueva Vaca</span>
          </button>
        </div>

        <!-- Fila de Tarjetas de Resumen Rápido -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:16px;">
          <div class="bank-card" style="padding:18px 20px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Mis Vacas Creadas</span>
            <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;">
              <span class="tabular-nums" style="font-size:24px;font-weight:700;color:#0F172A;">${myCows.length}</span>
              <span style="font-size:12px;color:#64748B;">iniciativa(s)</span>
            </div>
            <div style="font-size:12px;color:#0E744A;margin-top:4px;font-weight:500;">
              Total recaudado: <span class="tabular-nums font-semibold">${formatCOP(totalCollectedInMyCows)}</span>
            </div>
          </div>

          <div class="bank-card" style="padding:18px 20px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Otras Vacas (Participante)</span>
            <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;">
              <span class="tabular-nums" style="font-size:24px;font-weight:700;color:#0F172A;">${otherCows.length}</span>
              <span style="font-size:12px;color:#64748B;">fondos compartidos</span>
            </div>
            <div style="font-size:12px;color:#173B63;margin-top:4px;font-weight:500;">
              Mis aportes acumulados: <span class="tabular-nums font-semibold">${formatCOP(totalMyContributions)}</span>
            </div>
          </div>

          <div class="bank-card" style="padding:18px 20px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Vacas en Recaudación</span>
            <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;">
              <span class="tabular-nums" style="font-size:24px;font-weight:700;color:#0E744A;">${activeCowsCount}</span>
              <span style="font-size:12px;color:#64748B;">activas / en meta</span>
            </div>
            <div style="font-size:12px;color:#64748B;margin-top:4px;">
              Custodia protegida por PostgreSQL
            </div>
          </div>
        </div>

        <!-- Barra de Control: Pestañas de Segmentación y Buscador -->
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
          <!-- Pestañas de Clasificación -->
          <div class="cows-filter-tabs">
            <button type="button" class="cows-filter-tab ${activeTabFilter === 'all' ? 'active' : ''}" data-tab="all">
              <span>Todas</span>
              <span class="cows-tab-count">${allCows.length}</span>
            </button>
            <button type="button" class="cows-filter-tab ${activeTabFilter === 'mine' ? 'active' : ''}" data-tab="mine">
              <span>Mis Vacas</span>
              <span class="cows-tab-count">${myCows.length}</span>
            </button>
            <button type="button" class="cows-filter-tab ${activeTabFilter === 'others' ? 'active' : ''}" data-tab="others">
              <span>Otras Vacas</span>
              <span class="cows-tab-count">${otherCows.length}</span>
            </button>
          </div>

          <!-- Input de Búsqueda -->
          <div style="position:relative;width:100%;max-width:300px;">
            <div style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94A3B8;pointer-events:none;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <input type="text" id="cowSearchInput" class="bank-input" placeholder="Buscar por nombre..." value="${searchQuery}" style="padding-left:36px;font-size:13px;" />
          </div>
        </div>

        <!-- Contenedor Principal de Secciones de Vacas -->
        <div style="display:flex;flex-direction:column;gap:36px;">

          <!-- SECCIÓN 1: MIS VACAS (Creadas por mí) -->
          ${
            activeTabFilter === "all" || activeTabFilter === "mine"
              ? `
              <div id="sectionMyCows">
                <div class="cows-section-header">
                  <div>
                    <h2 class="cows-section-title">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#173B63" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                      Mis Vacas (Iniciativas Propias)
                      <span class="badge badge-navy" style="font-size:11px;">${filteredMyCows.length}</span>
                    </h2>
                    <p class="cows-section-subtitle">
                      Fondos creados por ti. Administras la meta, los invitados y tienes autorización exclusiva de desembolso.
                    </p>
                  </div>
                </div>

                ${
                  filteredMyCows.length === 0
                    ? `
                    <div class="bank-empty-state">
                      <svg class="bank-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
                      </svg>
                      <div style="font-weight:600;font-size:15px;color:#0F172A;margin-bottom:4px;">No has creado ninguna vaca todavía</div>
                      <div style="font-size:13px;color:#64748B;max-width:380px;margin:0 auto 16px auto;">Crea una iniciativa para viajes, regalos o compras colectivas con tus contactos registrados.</div>
                      <button type="button" class="bank-btn bank-btn-primary btnTriggerCreateCow" style="font-size:13px;">
                        + Crear mi primera vaca
                      </button>
                    </div>
                  `
                    : `
                    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(350px, 1fr));gap:20px;">
                      ${filteredMyCows.map((cow) => renderCowCard(cow, active, true)).join("")}
                    </div>
                  `
                }
              </div>
            `
              : ""
          }

          <!-- SECCIÓN 2: OTRAS VACAS (En las que participo) -->
          ${
            activeTabFilter === "all" || activeTabFilter === "others"
              ? `
              <div id="sectionOtherCows">
                <div class="cows-section-header">
                  <div>
                    <h2 class="cows-section-title">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                      Otras Vacas (Fondos en los que Participas)
                      <span class="badge badge-info" style="font-size:11px;">${filteredOtherCows.length}</span>
                    </h2>
                    <p class="cows-section-subtitle">
                      Iniciativas organizadas por tus contactos donde has sido invitado para colaborar y aportar fondos.
                    </p>
                  </div>
                </div>

                ${
                  filteredOtherCows.length === 0
                    ? `
                    <div class="bank-empty-state">
                      <svg class="bank-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      </svg>
                      <div style="font-weight:600;font-size:15px;color:#0F172A;margin-bottom:4px;">No participas en vacas de otros usuarios</div>
                      <div style="font-size:13px;color:#64748B;">Cuando otro usuario te invite a su vaca, aparecerá listada en esta sección.</div>
                    </div>
                  `
                    : `
                    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(350px, 1fr));gap:20px;">
                      ${filteredOtherCows.map((cow) => renderCowCard(cow, active, false)).join("")}
                    </div>
                  `
                }
              </div>
            `
              : ""
          }

        </div>

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

    return `
      <div class="cow-card ${isMine ? 'cow-card-mine' : 'cow-card-other'}">
        <div>
          <!-- Insignias Superiores -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            ${
              isAnonymous
                ? `<span class="badge badge-warning" title="Aportes individuales confidenciales (Zero-Trust)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Anónima (Zero-Trust)
                  </span>`
                : `<span class="badge badge-info" title="Aportes visibles para todos">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>
                    Pública
                  </span>`
            }

            <div style="display:flex;align-items:center;gap:6px;">
              ${
                isMine
                  ? `<span class="badge badge-navy" style="font-size:11px;">Eres Creador</span>`
                  : `<span class="badge badge-neutral" style="font-size:11px;">Por ${creatorName.split(" ")[0]}</span>`
              }
              ${
                isDisbursed
                  ? `<span class="badge badge-navy">Desembolsada</span>`
                  : isCompleted
                  ? `<span class="badge badge-success">Meta Alcanzada</span>`
                  : isCancelled
                  ? `<span class="badge badge-danger">Cancelada</span>`
                  : `<span class="badge badge-success" style="background:#EBF8F2;color:#0E744A;">Activa</span>`
              }
            </div>
          </div>

          <!-- Título y Descripción -->
          <h3 style="font-size:17px;font-weight:700;color:#0F172A;margin:0 0 6px 0;letter-spacing:-0.2px;">
            ${cow.title}
          </h3>
          <p style="font-size:13px;color:#64748B;margin:0 0 16px 0;line-height:1.45;min-height:36px;">
            ${cow.description || "Iniciativa colaborativa de ahorro grupal."}
          </p>

          <!-- Montos y Progreso -->
          <div style="background:#F8FAFD;border:1px solid #E2E8F0;border-radius:12px;padding:14px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;">
              <div>
                <span style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Recaudado</span>
                <div class="tabular-nums" style="font-size:22px;font-weight:700;color:#0F172A;">
                  ${formatCOP(cow.collected_amount)}
                </div>
              </div>
              <div style="text-align:right;">
                <span style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Meta</span>
                <div class="tabular-nums" style="font-size:14px;font-weight:600;color:#64748B;">
                  ${formatCOP(cow.target_amount)}
                </div>
              </div>
            </div>

            <!-- Barra de Progreso -->
            <div class="bank-progress-track">
              <div class="bank-progress-bar ${progress >= 100 ? 'completed' : ''}" style="width:${progress}%;"></div>
            </div>

            <div style="display:flex;justify-content:space-between;font-size:12px;color:#64748B;margin-top:8px;">
              <span><strong>${cow.progress_percentage}%</strong> completado</span>
              <span>${remaining > 0 ? `Faltan ${formatCOP(remaining)}` : "¡Meta lograda!"}</span>
            </div>
          </div>

          <!-- Aporte personal del usuario activo -->
          ${
            cow.my_contribution > 0
              ? `
              <div style="background:#EAF6EF;border:1px solid #B7E4CF;border-radius:8px;padding:9px 12px;margin-bottom:16px;font-size:12px;display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#0E744A;font-weight:500;">Tu aporte personal:</span>
                <strong class="tabular-nums" style="color:#0E744A;font-size:13px;font-weight:700;">${formatCOP(cow.my_contribution)}</strong>
              </div>
            `
              : ""
          }

          <!-- Contador de Participantes -->
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#64748B;margin-bottom:14px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>${(cow.members || []).length} participante(s) vinculados</span>
          </div>
        </div>

        <!-- Acciones Inferiores de la Tarjeta -->
        <div style="display:flex;gap:8px;padding-top:14px;border-top:1px solid #E2E8F0;flex-wrap:wrap;">
          <button type="button" class="bank-btn bank-btn-secondary btnViewMembers" data-id="${cow.id}" style="flex:1;font-size:13px;padding:8px 12px;">
            Participantes
          </button>
          
          ${
            canContribute
              ? `
              <button type="button" class="bank-btn bank-btn-primary btnOpenContribute" data-id="${cow.id}" style="flex:1;font-size:13px;padding:8px 12px;">
                Aportar
              </button>
            `
              : ""
          }

          ${
            canDisburse
              ? `
              <button type="button" class="bank-btn bank-btn-success btnOpenDisburse" data-id="${cow.id}" style="flex:1;font-size:13px;padding:8px 12px;background:#0E744A;">
                Desembolsar
              </button>
            `
              : ""
          }
        </div>
      </div>
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
   * Modal 1: Creación Avanzada de Vaca con Selección Visual y Vista Previa en Vivo.
   */
  function openCreateModal() {
    const root = getModalRoot();
    const active = store.getActiveUser();
    const availableContacts = store.getUsers().filter((u) => u.id !== active.id);

    let selectedVisibility = "PUBLIC"; // 'PUBLIC' | 'ANONYMOUS'

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content bank-modal-content-lg">
          
          <!-- Encabezado del Modal -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid #E2E8F0;">
            <div>
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;border-radius:10px;background:#EAF2FA;color:#173B63;display:flex;align-items:center;justify-content:center;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                </div>
                <div>
                  <h3 style="font-size:18px;font-weight:700;margin:0;color:#0F172A;">Nueva Vaca Colaborativa</h3>
                  <span style="font-size:12px;color:#64748B;">Configura la bóveda financiera, meta y nivel de privacidad</span>
                </div>
              </div>
            </div>
            <button type="button" class="btnModalClose" style="background:none;border:none;cursor:pointer;color:#94A3B8;padding:4px;border-radius:4px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <form id="createCowForm" style="display:flex;flex-direction:column;gap:18px;">
            
            <!-- 1. Datos Básicos -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(250px, 1fr));gap:14px;">
              <div>
                <label class="bank-label" for="cowTitle">Nombre de la Vaca: *</label>
                <input id="cowTitle" class="bank-input" type="text" placeholder="Ej. Viaje a Cartagena, Asado Fin de Año" required maxlength="120" />
              </div>

              <div>
                <label class="bank-label" for="cowTargetAmount">Meta de recaudación (COP): *</label>
                <input id="cowTargetAmount" class="bank-input tabular-nums" type="number" min="1" step="any" placeholder="Ej. 500000" required />
              </div>
            </div>

            <!-- Chips de atajo rápido para montos de meta -->
            <div>
              <span style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;margin-bottom:6px;display:block;">Atajos rápidos de meta:</span>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button type="button" class="bank-btn-chip btnPresetTarget" data-val="100000">$100.000</button>
                <button type="button" class="bank-btn-chip btnPresetTarget" data-val="250000">$250.000</button>
                <button type="button" class="bank-btn-chip btnPresetTarget" data-val="500000">$500.000</button>
                <button type="button" class="bank-btn-chip btnPresetTarget" data-val="1000000">$1.000.000</button>
                <button type="button" class="bank-btn-chip btnPresetTarget" data-val="2500000">$2.500.000</button>
              </div>
            </div>

            <div>
              <label class="bank-label" for="cowDescription">Propósito o descripción (opcional):</label>
              <textarea id="cowDescription" class="bank-textarea" rows="2" placeholder="Explica el objetivo de esta iniciativa para los miembros invitados." maxlength="255"></textarea>
            </div>

            <!-- 2. Selector Interactivo de Privacidad (Radio Cards) -->
            <div>
              <label class="bank-label">Modalidad de Privacidad de la Bóveda: *</label>
              <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:12px;margin-top:6px;">
                
                <!-- Opción Pública -->
                <div class="privacy-option-card selected" id="optPrivacyPublic" data-val="PUBLIC">
                  <div class="privacy-radio-circle"></div>
                  <div>
                    <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:14px;color:#0F172A;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#173B63" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>
                      Iniciativa Pública
                    </div>
                    <div style="font-size:12px;color:#64748B;margin-top:3px;line-height:1.4;">
                      Todos los participantes pueden ver los aportes y montos individuales de cada miembro.
                    </div>
                  </div>
                </div>

                <!-- Opción Anónima (Zero-Trust) -->
                <div class="privacy-option-card" id="optPrivacyAnonymous" data-val="ANONYMOUS">
                  <div class="privacy-radio-circle"></div>
                  <div>
                    <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:14px;color:#0F172A;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B45309" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Anónima (Zero-Trust)
                    </div>
                    <div style="font-size:12px;color:#64748B;margin-top:3px;line-height:1.4;">
                      Aportes 100% confidenciales. Ningún miembro ve los montos de otros; solo el total en bóveda.
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <!-- 3. Selector de Participantes Invitados -->
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <label class="bank-label" style="margin:0;">Invitar participantes:</label>
                <div style="display:flex;gap:8px;">
                  <button type="button" id="btnSelectAllContacts" style="background:none;border:none;color:#173B63;font-size:12px;font-weight:600;cursor:pointer;padding:0;">
                    Seleccionar todos
                  </button>
                  <span style="color:#CBD5E1;">•</span>
                  <button type="button" id="btnUnselectAllContacts" style="background:none;border:none;color:#64748B;font-size:12px;font-weight:500;cursor:pointer;padding:0;">
                    Deseleccionar
                  </button>
                </div>
              </div>

              <div style="display:flex;flex-direction:column;gap:8px;max-height:150px;overflow-y:auto;padding:8px;border:1px solid #E2E8F0;border-radius:10px;background:#F8FAFD;">
                ${
                  availableContacts.length === 0
                    ? `<span style="font-size:12px;color:#64748B;padding:8px;">No hay otros usuarios registrados para invitar. Puedes registrar personas desde la cabecera.</span>`
                    : availableContacts
                        .map(
                          (c) => `
                          <label class="contact-invite-row checked">
                            <div style="display:flex;align-items:center;gap:10px;">
                              <input type="checkbox" class="cowInviteCheckbox" value="${c.id}" checked style="width:16px;height:16px;accent-color:#173B63;cursor:pointer;" />
                              <div style="width:26px;height:26px;border-radius:50%;background:#173B63;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">
                                ${c.initials || "US"}
                              </div>
                              <div>
                                <span style="font-size:13px;font-weight:600;color:#0F172A;">${c.name}</span>
                                <span style="font-size:11px;color:#64748B;font-family:monospace;margin-left:6px;">${c.phone}</span>
                              </div>
                            </div>
                            <span class="badge badge-navy" style="font-size:11px;padding:2px 6px;">${c.role || "Usuario"}</span>
                          </label>
                        `
                        )
                        .join("")
                }
              </div>
              <span style="font-size:11px;color:#64748B;margin-top:4px;display:block;">
                Aislamiento estricto: Solo tú y las personas que marques podrán ver y participar en esta vaca.
              </span>
            </div>

            <!-- Botones de Acción -->
            <div style="display:flex;gap:10px;margin-top:10px;padding-top:14px;border-top:1px solid #E2E8F0;justify-content:flex-end;">
              <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cancelar</button>
              <button type="submit" id="btnSubmitCreateCow" class="bank-btn bank-btn-primary" ${isSubmitting ? "disabled" : ""}>
                ${isSubmitting ? `<span class="bank-spinner"></span> Creando Bóveda...` : `Crear Vaca (Bóveda Segura)`}
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
      if (type === "PUBLIC") {
        optPublic.classList.add("selected");
        optAnonymous.classList.remove("selected");
      } else {
        optAnonymous.classList.add("selected");
        optPublic.classList.remove("selected");
      }
    }

    if (optPublic) optPublic.addEventListener("click", () => setPrivacy("PUBLIC"));
    if (optAnonymous) optAnonymous.addEventListener("click", () => setPrivacy("ANONYMOUS"));

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
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
            <div>
              <h3 style="font-size:18px;font-weight:700;margin:0;color:#0F172A;">Aportar a "${cow.title}"</h3>
              <span style="font-size:12px;color:#64748B;">Transferencia atómica a la cuenta custodia de la vaca</span>
            </div>
            <button type="button" class="btnModalClose" style="background:none;border:none;cursor:pointer;color:#94A3B8;padding:4px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style="background:#F8FAFD;border:1px solid #E2E8F0;border-radius:12px;padding:14px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
              <span style="color:#64748B;">Tu saldo disponible:</span>
              <strong class="tabular-nums" style="color:#0F172A;">${formatCOP(balance)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:#64748B;">Faltante para la meta:</span>
              <span class="tabular-nums font-semibold" style="color:#173B63;">${formatCOP(remaining)}</span>
            </div>
          </div>

          <form id="contributeForm" style="display:flex;flex-direction:column;gap:14px;">
            <div>
              <label class="bank-label" for="contribAmount">Monto a aportar (COP): *</label>
              <input id="contribAmount" class="bank-input tabular-nums" type="number" min="1" step="any" placeholder="Ej. 25000" required />
              
              <!-- Chips sugeridos -->
              <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                <button type="button" class="bank-btn-chip btnPresetContrib" data-val="10000">+$10.000</button>
                <button type="button" class="bank-btn-chip btnPresetContrib" data-val="20000">+$20.000</button>
                <button type="button" class="bank-btn-chip btnPresetContrib" data-val="50000">+$50.000</button>
                ${remaining > 0 ? `<button type="button" class="bank-btn-chip btnPresetContrib" data-val="${remaining}">Completar Meta</button>` : ""}
              </div>
            </div>

            <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
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
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
            <div>
              <h3 style="font-size:18px;font-weight:700;margin:0;color:#0F172A;">Liquidación y Desembolso</h3>
              <span style="font-size:12px;color:#64748B;">Transferencia del 100% de la bóveda a tu cuenta</span>
            </div>
            <button type="button" class="btnModalClose" style="background:none;border:none;cursor:pointer;color:#94A3B8;padding:4px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style="padding:18px;background:#EAF6EF;border:1px solid #B7E4CF;border-radius:12px;margin-bottom:16px;text-align:center;">
            <div style="font-size:13px;color:#0E744A;font-weight:600;margin-bottom:4px;">
              Monto total recaudado a transferir:
            </div>
            <div class="tabular-nums" style="font-size:32px;font-weight:700;color:#0E744A;">
              ${formatCOP(cow.collected_amount)}
            </div>
          </div>

          <p style="font-size:13px;color:#64748B;line-height:1.5;margin:0 0 18px 0;">
            Al confirmar, los fondos acumulados en la bóveda de <strong>"${cow.title}"</strong> se liquidarán atómicamente a tu cuenta corriente personal. El estado pasará a <strong>DESEMBOLSADA</strong>.
          </p>

          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cancelar</button>
            <button type="button" id="btnConfirmDisburse" class="bank-btn bank-btn-success" style="background:#0E744A;" ${isSubmitting ? "disabled" : ""}>
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
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <h3 style="font-size:18px;font-weight:700;margin:0;color:#0F172A;">Participantes de "${cow.title}"</h3>
                ${
                  isAnonymous
                    ? `<span class="badge badge-warning" style="font-size:11px;">Privada / Anónima</span>`
                    : `<span class="badge badge-info" style="font-size:11px;">Pública</span>`
                }
              </div>
              <span style="font-size:12px;color:#64748B;">
                ${
                  isAnonymous
                    ? `Regla Zero-Trust: Cada miembro solo ve su propio aporte. Los de terceros se enmascaran en el servidor.`
                    : `Regla Pública: Todos los miembros autorizados pueden ver los montos aportados.`
                }
              </span>
            </div>
            <button type="button" class="btnModalClose" style="background:none;border:none;cursor:pointer;color:#94A3B8;padding:4px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Lista de Miembros con Aportes Autorizados -->
          <div style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
            ${
              members.length === 0
                ? `<div style="padding:24px;text-align:center;color:#64748B;font-size:13px;">No hay miembros registrados.</div>`
                : members
                    .map((m, idx) => {
                      const isMe = m.user_id === active.id;
                      const hasAmount = m.amount_contributed !== null && m.amount_contributed !== undefined;

                      return `
                      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:${idx === members.length - 1 ? "none" : "1px solid #EDF2F7"};background:${isMe ? "#F8FAFD" : "#FFFFFF"};">
                        <div style="display:flex;align-items:center;gap:10px;">
                          <div style="width:30px;height:30px;border-radius:50%;background:${isMe ? '#173B63' : '#EDF2F7'};color:${isMe ? '#FFFFFF' : '#475569'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">
                            ${(m.full_name || "US").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style="display:flex;align-items:center;gap:6px;">
                              <strong style="font-size:13px;color:#0F172A;">${m.full_name}</strong>
                              ${isMe ? `<span class="badge badge-navy" style="font-size:11px;padding:2px 6px;">Tú</span>` : ""}
                              ${m.role === "CREATOR" ? `<span class="badge badge-info" style="font-size:11px;padding:2px 6px;">Creador</span>` : ""}
                            </div>
                            <span style="font-size:11px;color:#64748B;">Vinculado: ${formatDate(m.joined_at)}</span>
                          </div>
                        </div>

                        <div style="text-align:right;">
                          ${
                            hasAmount
                              ? `<span class="tabular-nums" style="font-size:14px;font-weight:700;color:#0E744A;">${formatCOP(m.amount_contributed)}</span>`
                              : `<span class="badge badge-warning" style="font-size:11px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Aporte Protegido</span>`
                          }
                        </div>
                      </div>
                    `;
                    })
                    .join("")}
          </div>

          <!-- Total Consistente -->
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#F8FAFD;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:16px;">
            <span style="font-size:13px;font-weight:600;color:#475569;">Total Acumulado en Bóveda:</span>
            <strong class="tabular-nums" style="font-size:16px;color:#0F172A;font-weight:700;">${formatCOP(cow.collected_amount)}</strong>
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