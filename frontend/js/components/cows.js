/**
 * Módulo de Fondos Colaborativos ("Vaquitas") para HabiReto / Vaqui.
 *
 * Implementa las dos vistas de Stitch para bolsillos colectivos:
 * 1. Panel Principal de Vaquitas (vaquitas_panel_principal_habireto): barra de filtros,
 *    buscador, cuadrícula de «Mis vaquitas», «Donde participo» (con banner informativo Bre-B)
 *    e «Historial de vaquitas».
 * 2. Creación de Nueva Vaquita a Pantalla Completa (vaquitas_nueva_vaquita_pantalla_completa):
 *    formulario paso a paso en 8 columnas (Nombre, Monto, Privacidad Pública/Privada y
 *    Participantes por llave @ABC123) más riel lateral sticky de Previsualización en vivo
 *    con cálculo automático de cuota estimada por integrante.
 */

import { api, formatCOP, formatDate } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

/**
 * Recarga la lista de vaquitas desde el backend y sincroniza el contador del menú lateral.
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
 * Inicializa el módulo de Vaquitas en el contenedor DOM especificado.
 *
 * @param {string} containerId - Identificador del nodo contenedor raíz.
 */
export function initCows(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Estado local de navegación interna y filtros
  let viewMode = "list"; // 'list' | 'create'
  let activeTabFilter = "all"; // 'all' | 'mine' | 'others' | 'history'
  let searchQuery = "";
  let isSubmitting = false;

  // Estado del asistente de creación a pantalla completa
  let createDraft = {
    title: "",
    description: "",
    targetAmount: "300000",
    visibilityType: "PUBLIC", // 'PUBLIC' | 'ANONYMOUS'
    invitedKeys: [],
  };

  async function loadCows() {
    await reloadCows();
  }

  /**
   * Actualiza la insignia numérica de vaquitas activas en el menú lateral.
   *
   * @param {number} count - Total de vaquitas activas del usuario.
   */
  function updateSidebarBadge(count) {
    const badge = document.getElementById("sidebarCowsBadge");
    if (badge) {
      badge.textContent = String(count);
    }
  }

  /**
   * Renderiza la vista activa del módulo de Vaquitas (Listado o Pantalla Completa de Creación).
   *
   * @param {Object} state - Estado global reactivo.
   */
  function render(state) {
    const active = state.activeUser || {};
    const allCows = state.cows || [];

    // Clasificar vaquitas en activas propias, activas donde participa e historial
    const myCows = [];
    const otherCows = [];
    const historyCows = [];

    allCows.forEach((cow) => {
      const isFinished = cow.status === "DISBURSED" || cow.status === "CANCELLED";
      const myMembership = (cow.members || []).find((m) => m.user_id === active.id);
      const isCreator =
        (myMembership && myMembership.role === "CREATOR") ||
        (cow.creator_id && cow.creator_id === active.id);

      if (isFinished) {
        historyCows.push({ cow, isCreator });
      } else if (isCreator) {
        myCows.push(cow);
      } else {
        otherCows.push(cow);
      }
    });

    const activeCount = myCows.length + otherCows.length;
    updateSidebarBadge(activeCount);

    if (viewMode === "create") {
      renderCreateFullScreenView(state);
      return;
    }

    // Filtrado por texto de búsqueda
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
    const filteredHistoryCows = historyCows.filter(({ cow }) => filterBySearch([cow]).length > 0);

    const showMine = activeTabFilter === "all" || activeTabFilter === "mine";
    const showOthers = activeTabFilter === "all" || activeTabFilter === "others";
    const showHistory = activeTabFilter === "all" || activeTabFilter === "history";

    container.innerHTML = `
      <div class="space-y-8">

        <!-- BARRA SUPERIOR: Pestañas de Filtro + Buscador + "+ Nueva vaquita" -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-[#eae5db] shadow-sm">
          <!-- Pestañas de filtro -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0" role="tablist">
            ${[
              { id: "all", label: "Todas", count: activeCount },
              { id: "mine", label: "Mías", count: myCows.length },
              { id: "others", label: "Invitado", count: otherCows.length },
              { id: "history", label: "Historial", count: historyCows.length },
            ]
              .map((tab) => {
                const isAct = activeTabFilter === tab.id;
                return `
                  <button
                    type="button"
                    data-tab="${tab.id}"
                    class="cows-filter-btn px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer border-0 ${
                      isAct
                        ? "bg-[#4a7c59] text-white shadow-sm shadow-[#4a7c59]/20"
                        : "bg-transparent text-[#5d645e] hover:text-[#191c1d] hover:bg-[#f5f1ea] font-semibold"
                    }"
                  >
                    <span>${tab.label}</span>
                    <span class="${
                      isAct ? "bg-white/20 text-white" : "bg-[#f5f1ea] text-[#5d645e]"
                    } text-xs px-1.5 py-0.5 rounded-full font-semibold tabular-nums">${tab.count}</span>
                  </button>
                `;
              })
              .join("")}
          </div>

          <!-- Buscador + Botón Nueva Vaquita -->
          <div class="flex items-center gap-3">
            <div class="relative w-full md:w-64">
              <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#788179] text-xl">search</span>
              <input
                type="search"
                id="cowSearchInput"
                value="${searchQuery}"
                placeholder="Buscar vaquita por nombre..."
                aria-label="Buscar vaquita por nombre"
                class="w-full pl-10 pr-4 py-2 bg-[#f5f1ea] border border-transparent focus:border-[#4a7c59] focus:bg-white focus:outline-none rounded-xl text-sm text-[#191c1d] placeholder-[#788179] transition-all font-medium"
              />
            </div>

            <button
              type="button"
              id="btnOpenCreateCow"
              class="flex items-center gap-2 px-4 py-2.5 bg-[#4a7c59] hover:bg-[#3d6749] text-white font-bold text-sm rounded-xl transition-all shadow-sm shadow-[#4a7c59]/30 whitespace-nowrap active:scale-[0.98] cursor-pointer border-0"
            >
              <span class="material-symbols-outlined text-lg">add_circle</span>
              <span>Nueva vaquita</span>
            </button>
          </div>
        </div>

        <!-- SECCIÓN 1: MIS VAQUITAS -->
        ${
          showMine
            ? `
            <section class="space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <h2 class="font-heading font-extrabold text-xl text-[#191c1d] m-0">Mis vaquitas</h2>
                  <span class="text-xs px-2.5 py-0.5 rounded-full bg-[#e8f1eb] text-[#20462c] font-bold tabular-nums">
                    ${myCows.length} ${myCows.length === 1 ? "activa" : "activas"}
                  </span>
                </div>
              </div>

              ${
                filteredMyCows.length === 0
                  ? `<div class="bg-white rounded-3xl p-8 border border-[#eae5db] text-center space-y-3">
                      <div class="w-12 h-12 rounded-2xl bg-[#e8f1eb] text-[#4a7c59] flex items-center justify-center mx-auto">
                        <span class="material-symbols-outlined text-2xl">savings</span>
                      </div>
                      <p class="text-sm text-[#5d645e] m-0">Aún no tienes vaquitas activas creadas por ti.</p>
                      <button type="button" class="btnTriggerCreateCow inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#f5f1ea] hover:bg-[#eae5db] text-[#191c1d] text-xs font-bold transition-colors cursor-pointer border-0">
                        <span class="material-symbols-outlined text-base text-[#4a7c59]">add_circle</span>
                        <span>Crear mi primera vaquita</span>
                      </button>
                    </div>`
                  : `<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      ${filteredMyCows.map((cow) => renderCowCard(cow, active, true)).join("")}
                    </div>`
              }
            </section>
          `
            : ""
        }

        <!-- SECCIÓN 2: DONDE PARTICIPO -->
        ${
          showOthers
            ? `
            <section class="space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <h2 class="font-heading font-extrabold text-xl text-[#191c1d] m-0">Donde participo</h2>
                  <span class="text-xs px-2.5 py-0.5 rounded-full bg-[#f5f1ea] text-[#5d645e] font-bold tabular-nums">
                    ${otherCows.length} ${otherCows.length === 1 ? "activa" : "activas"}
                  </span>
                </div>
                <span class="text-xs text-[#5d645e] font-medium">Vaquitas creadas por amigos</span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                ${filteredOtherCows.map((cow) => renderCowCard(cow, active, false)).join("")}

                <!-- Tarjeta informativa de interoperabilidad por llave Vaqui (Diseño Stitch) -->
                <div class="bg-[#f5f1ea] rounded-3xl p-6 border border-[#eae5db] flex flex-col justify-between">
                  <div class="space-y-3">
                    <div class="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-[#4a7c59] shadow-sm">
                      <span class="material-symbols-outlined text-xl">groups_2</span>
                    </div>
                    <h3 class="font-heading font-bold text-lg text-[#191c1d] m-0">¿Te invitaron con tu llave Vaqui?</h3>
                    <p class="text-xs text-[#5d645e] leading-relaxed m-0">
                      Cuando tus amigos organicen una reunión o regalo y te agreguen con tu llave <strong class="text-[#191c1d] font-mono tabular-nums">${active.userKey || "@ALI111"}</strong>, la invitación aparecerá automáticamente en esta sección para que aportes en segundos sin comisiones.
                    </p>
                  </div>
                  <div class="pt-4 flex items-center gap-2 text-xs font-bold text-[#4a7c59]">
                    <span class="material-symbols-outlined text-sm">shield</span>
                    <span>Protección Bre-B de interoperabilidad directa</span>
                  </div>
                </div>
              </div>
            </section>
          `
            : ""
        }

        <!-- SECCIÓN 3: HISTORIAL DE VAQUITAS -->
        ${
          showHistory
            ? `
            <section class="space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <h2 class="font-heading font-extrabold text-xl text-[#191c1d] m-0">Historial de vaquitas</h2>
                  <span class="text-xs px-2.5 py-0.5 rounded-full bg-[#f5f1ea] text-[#788179] font-bold tabular-nums">
                    ${historyCows.length} ${historyCows.length === 1 ? "completada" : "completadas"}
                  </span>
                </div>
                <span class="text-xs text-[#5d645e] font-medium">Bolsillos cerrados y liquidados</span>
              </div>

              ${
                filteredHistoryCows.length === 0
                  ? `<div class="bg-white rounded-3xl p-6 border border-[#eae5db] text-center text-xs text-[#5d645e]">
                      Las vaquitas terminadas o liquidadas se archivarán en esta sección.
                    </div>`
                  : `<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      ${filteredHistoryCows.map(({ cow, isCreator }) => renderCowCard(cow, active, isCreator)).join("")}
                    </div>`
              }
            </section>
          `
            : ""
        }

        <!-- Contenedor dinámico para Modales Contextuales -->
        <div id="cowModalRoot"></div>

      </div>
    `;

    bindListEvents(allCows);
  }

  /**
   * Renderiza una tarjeta individual de Vaquita siguiendo el diseño de Stitch.
   */
  function renderCowCard(cow, activeUser, isMine) {
    const isAnonymous = cow.visibility_type === "ANONYMOUS";
    const isCompleted = cow.status === "COMPLETED";
    const isDisbursed = cow.status === "DISBURSED";
    const isCancelled = cow.status === "CANCELLED";
    const isActive = cow.status === "ACTIVE";

    const displayCollected =
      isDisbursed || isCancelled
        ? cow.total_raised !== undefined && cow.total_raised !== null
          ? cow.total_raised
          : cow.collected_amount
        : cow.collected_amount;

    const progress = Math.min(100, Math.round((displayCollected / cow.target_amount) * 100));
    const remaining = Math.max(0, cow.target_amount - displayCollected);

    const isFull = isCompleted || remaining <= 0;
    const canDisburse = isMine && (isActive || isCompleted);
    const canContribute = isActive && !isFull && !isDisbursed && !isCancelled;

    const creatorMember = (cow.members || []).find((m) => m.role === "CREATOR");
    const creatorName = cow.creator_name || (creatorMember ? creatorMember.full_name : "Organizador");
    const originText = isMine ? "Creada por ti" : `De ${creatorName.split(" ")[0]}`;

    const memberCount = (cow.members || []).length;
    const contributions = cow.contributions || [];
    const latestContribution = contributions[0] || null;

    // Tarjeta de Historial (Terminada / Cancelada)
    if (isDisbursed || isCancelled) {
      return `
        <article class="bg-white rounded-3xl p-6 border border-[#eae5db] shadow-sm flex flex-col justify-between space-y-4 opacity-95">
          <div>
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2 mb-1.5">
                  <span class="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-[#f5f1ea] text-[#788179] font-bold tracking-wide uppercase border border-[#eae5db]">
                    <span class="material-symbols-outlined text-xs">archive</span>
                    ${isCancelled ? "Cancelada" : "Terminada"}
                  </span>
                  <span class="text-xs text-[#788179]">${isAnonymous ? "Privada" : "Pública"} • ${originText}</span>
                </div>
                <h3 class="font-heading font-bold text-xl text-[#191c1d] leading-snug m-0">${cow.title}</h3>
              </div>

              <div class="w-10 h-10 rounded-2xl bg-[#f5f1ea] flex items-center justify-center text-[#788179] flex-shrink-0">
                <span class="material-symbols-outlined text-xl">school</span>
              </div>
            </div>

            <div class="mt-4 p-3 rounded-2xl bg-[#f5f1ea] border border-[#eae5db]/80 flex items-center justify-between text-xs">
              <span class="text-[#5d645e] font-medium">Cerrada en historial</span>
              <span class="font-heading font-bold text-[#191c1d] text-sm tabular-nums">Recaudado: ${formatCOP(displayCollected)} COP</span>
            </div>
          </div>

          <div class="pt-2 border-t border-[#eae5db]/60 flex items-center justify-between">
            <span class="text-xs text-[#788179] flex items-center gap-1">
              <span class="material-symbols-outlined text-sm text-[#4a7c59]">check</span>
              ${isCancelled ? "Aportes reembolsados" : "Dinero transferido al creador"}
            </span>
            <button
              type="button"
              data-id="${cow.id}"
              class="btnViewMembers px-4 py-2 bg-[#f5f1ea] hover:bg-[#eae5db] text-[#191c1d] font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border-0 tabular-nums"
            >
              <span class="material-symbols-outlined text-sm text-[#5d645e]">group</span>
              <span>Invitados (${memberCount})</span>
            </button>
          </div>
        </article>
      `;
    }

    // Insignia superior según privacidad o logro de meta
    let topBadgeHtml = "";
    if (isCompleted) {
      topBadgeHtml = `
        <span class="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-[#e8f1eb] text-[#20462c] font-bold tracking-wide uppercase">
          <span class="material-symbols-outlined text-xs fill">verified</span> Meta lograda
        </span>
        <span class="text-xs text-[#788179]">${isAnonymous ? "Privada" : "Pública"} • ${originText}</span>
      `;
    } else if (isAnonymous) {
      topBadgeHtml = `
        <span class="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-[#fdf5eb] text-[#8e5b22] font-bold tracking-wide uppercase border border-[#fae2c8]">
          <span class="material-symbols-outlined text-xs">lock</span> Privada
        </span>
        <span class="text-xs text-[#788179]">• ${originText}</span>
      `;
    } else {
      topBadgeHtml = `
        <span class="text-xs px-2.5 py-0.5 rounded-full bg-[#f5f1ea] text-[#4a7c59] font-bold tracking-wide uppercase">Pública</span>
        <span class="text-xs text-[#788179]">• ${originText}</span>
      `;
    }

    const detailBtnLabel = isAnonymous
      ? isMine
        ? `Invitados (${memberCount})`
        : `Aportes (${contributions.length})`
      : isMine
      ? `Invitados (${memberCount})`
      : `Aportes (${memberCount})`;

    const detailBtnIcon = isMine ? "group" : "receipt_long";

    return `
      <article class="bg-white rounded-3xl p-6 border border-[#eae5db] shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col justify-between space-y-6 relative overflow-hidden">
        <div>
          <!-- Encabezado de la Tarjeta -->
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                ${topBadgeHtml}
              </div>
              <h3 class="font-heading font-bold text-xl text-[#191c1d] leading-snug m-0">${cow.title}</h3>
            </div>

            <div class="w-10 h-10 rounded-2xl ${
              isAnonymous ? "bg-[#fdf5eb] text-[#8e5b22]" : "bg-[#e8f1eb] text-[#4a7c59]"
            } flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined fill text-xl">${
                isAnonymous ? "celebration" : isCompleted ? "outdoor_grill" : "flight_takeoff"
              }</span>
            </div>
          </div>

          <!-- Progreso y Montos -->
          <div class="mt-5 space-y-3">
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-heading font-extrabold text-2xl text-[#191c1d] tracking-tight tabular-nums">
                ${formatCOP(displayCollected)} <span class="text-sm font-semibold text-[#5d645e]">de ${formatCOP(cow.target_amount)} COP</span>
              </span>
              <span class="font-heading font-bold text-sm text-[#20462c] bg-[#e8f1eb] px-2 py-0.5 rounded-lg tabular-nums">
                ${progress}%
              </span>
            </div>

            <!-- Barra de Progreso Terra -->
            <div class="w-full h-3 bg-[#f5f1ea] rounded-full overflow-hidden p-0.5 border border-[#eae5db]" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
              <div class="h-full bg-[#4a7c59] rounded-full transition-all duration-500 shadow-sm" style="width: ${progress}%;"></div>
            </div>

            <!-- Detalles de Meta y Aporte Propio -->
            <div class="flex items-center justify-between text-xs text-[#5d645e] pt-1 flex-wrap gap-2">
              ${
                remaining > 0
                  ? `<div class="flex items-center gap-1.5 font-medium tabular-nums">
                      <span class="material-symbols-outlined text-base text-[#788179]">pending</span>
                      <span>Faltan <strong class="text-[#191c1d]">${formatCOP(remaining)}</strong></span>
                    </div>`
                  : `<div class="flex items-center gap-1.5 font-bold text-[#4a7c59]">
                      <span class="material-symbols-outlined text-base">task_alt</span>
                      <span>Meta lograda con éxito</span>
                    </div>`
              }
              <div class="flex items-center gap-1.5 font-medium tabular-nums">
                <span class="material-symbols-outlined text-base text-[#4a7c59]">payments</span>
                <span>Tu aporte: <strong class="text-[#20462c]">${formatCOP(cow.my_contribution || 0)}</strong></span>
              </div>
            </div>

            <!-- Píldora de Actividad Anónima en Vaquitas Privadas -->
            ${
              isAnonymous && latestContribution
                ? `<div class="mt-3 flex items-center gap-2 p-2.5 rounded-xl bg-[#f5f1ea] border border-[#eae5db] text-xs text-[#5d645e] tabular-nums">
                    <span class="material-symbols-outlined text-base text-[#4a7c59]">visibility_off</span>
                    <span class="font-medium text-[#191c1d]">
                      <span class="font-bold text-[#4a7c59]">+</span> Alguien ha aportado <strong class="text-[#191c1d]">${formatCOP(latestContribution.amount)}</strong>
                      ${
                        contributions.length > 1
                          ? `<span class="text-[#788179]"> (+${contributions.length - 1} más)</span>`
                          : ""
                      }
                    </span>
                  </div>`
                : ""
            }
          </div>
        </div>

        <!-- Acciones de la Tarjeta -->
        <div class="space-y-3 pt-2 border-t border-[#eae5db]/60">
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              data-id="${cow.id}"
              class="btnViewMembers flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f5f1ea] hover:bg-[#eae5db] text-[#191c1d] font-bold text-sm rounded-xl transition-all cursor-pointer border-0 tabular-nums"
            >
              <span class="material-symbols-outlined text-lg text-[#5d645e]">${detailBtnIcon}</span>
              <span>${detailBtnLabel}</span>
            </button>

            ${
              canContribute
                ? `<button
                    type="button"
                    data-id="${cow.id}"
                    class="btnOpenContribute flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4a7c59] hover:bg-[#3d6749] text-white font-bold text-sm rounded-xl transition-all shadow-sm shadow-[#4a7c59]/20 cursor-pointer border-0"
                  >
                    <span class="material-symbols-outlined text-lg">add</span>
                    <span>Aportar</span>
                  </button>`
                : `<div class="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#e8f1eb] text-[#20462c] font-bold text-xs rounded-xl border border-[#c5ddcd] select-none">
                    <span class="material-symbols-outlined text-base">lock</span>
                    <span>Vaquita cerrada (100%)</span>
                  </div>`
            }
          </div>

          ${
            canDisburse
              ? isFull
                ? `<div class="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      data-id="${cow.id}"
                      class="btnOpenDisburse flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-[#4a7c59] hover:bg-[#3d6749] text-white font-bold text-sm transition-all shadow-sm cursor-pointer border-0"
                    >
                      <span class="material-symbols-outlined text-base">account_balance_wallet</span>
                      <span>Recibir dinero</span>
                    </button>
                    <button
                      type="button"
                      data-id="${cow.id}"
                      class="btnOpenDisburse flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl border border-[#f5c2bf] bg-[#fdf2f2] text-[#b83230] hover:bg-[#fbe4e4] font-bold text-sm transition-all cursor-pointer"
                    >
                      <span class="material-symbols-outlined text-base">replay</span>
                      <span>Reembolsar</span>
                    </button>
                  </div>`
                : `<button
                    type="button"
                    data-id="${cow.id}"
                    class="btnOpenDisburse w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#20462c] bg-transparent text-[#20462c] hover:bg-[#e8f1eb] font-bold text-sm transition-all cursor-pointer"
                  >
                    <span class="material-symbols-outlined text-base">check_circle</span>
                    <span>Terminar Vaquita</span>
                  </button>`
              : ""
          }
        </div>
      </article>
    `;
  }

  /**
   * Renderiza la vista a pantalla completa «Crear Nueva Vaquita» (Diseño Stitch: vaquitas_nueva_vaquita_pantalla_completa).
   */
  function renderCreateFullScreenView(state) {
    const active = state.activeUser || {};
    const users = state.users || [];
    const targetNum = Math.max(0, Number(createDraft.targetAmount) || 0);
    const totalParticipants = createDraft.invitedKeys.length + 1;
    const estimatedQuota = totalParticipants > 0 ? Math.round(targetNum / totalParticipants) : targetNum;
    const isPublic = createDraft.visibilityType === "PUBLIC";

    // Contactos sugeridos que aún no han sido agregados
    const availableContacts = users.filter(
      (u) =>
        u.id !== active.id &&
        u.userKey &&
        !createDraft.invitedKeys.includes(u.userKey.toUpperCase())
    );

    container.innerHTML = `
      <div class="flex flex-col w-full">
        <!-- Sub-encabezado con botón Volver a Vaquitas -->
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#eae5db]">
          <div class="space-y-1.5">
            <button
              type="button"
              id="btnBackToCowsList"
              class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#4a7c59] hover:text-[#20462c] transition-colors group bg-transparent border-0 cursor-pointer p-0"
            >
              <span class="material-symbols-outlined text-sm transition-transform group-hover:-translate-x-1">arrow_back</span>
              <span>Volver a Vaquitas</span>
            </button>
            <h2 class="font-heading font-extrabold text-3xl text-[#191c1d] tracking-tight m-0">
              Crear Nueva Vaquita
            </h2>
          </div>
        </div>

        <!-- Cuadrícula Principal: Pasos del Formulario (8 cols) + Previsualización Sticky (4 cols) -->
        <form id="createCowFullForm" class="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8 items-start">

          <!-- COLUMNA IZQUIERDA (8 cols): Pasos 1 a 4 -->
          <div class="lg:col-span-8 space-y-6">

            <!-- ================= PASO 1: NOMBRE Y DESCRIPCIÓN ================= -->
            <section class="bg-white p-6 md:p-8 rounded-3xl border border-[#eae5db] shadow-sm space-y-5">
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <span class="w-8 h-8 rounded-full bg-[#e8f1eb] text-[#4a7c59] flex items-center justify-center font-bold text-sm tabular-nums">1</span>
                  <h3 class="font-heading text-lg font-bold text-[#191c1d] m-0">Nombre de la iniciativa</h3>
                </div>
                <span class="text-xs font-mono font-medium text-[#5d645e] tabular-nums" id="nameCounter">${createDraft.title.length}/40</span>
              </div>

              <div class="space-y-4">
                <div>
                  <label class="block text-xs font-bold uppercase tracking-wider text-[#5d645e] mb-2" for="cowTitleInput">
                    Nombre de la Vaquita
                  </label>
                  <div class="relative">
                    <input
                      id="cowTitleInput"
                      type="text"
                      maxlength="40"
                      required
                      value="${createDraft.title}"
                      placeholder="Ej. Viaje a Cartagena, Regalo Cumpleaños Juli, Asado del Viernes"
                      class="w-full bg-[#f5f1ea] text-[#191c1d] font-heading font-bold text-lg px-5 py-4 rounded-2xl border border-[#eae5db] focus:outline-none focus:bg-white focus:border-[#4a7c59] focus:ring-2 focus:ring-[#4a7c59]/20 transition-all placeholder:text-[#788179]/60"
                    />
                    <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#4a7c59]">
                      <span class="material-symbols-outlined text-2xl">edit_note</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-bold uppercase tracking-wider text-[#5d645e] mb-2" for="cowDescInput">
                    Descripción o notas (opcional)
                  </label>
                  <textarea
                    id="cowDescInput"
                    rows="2"
                    maxlength="255"
                    placeholder="Añade detalles sobre el propósito o fecha esperada de la vaquita..."
                    class="w-full bg-[#f5f1ea] text-[#191c1d] text-sm p-4 rounded-2xl border border-[#eae5db] focus:outline-none focus:bg-white focus:border-[#4a7c59] focus:ring-2 focus:ring-[#4a7c59]/20 transition-all placeholder:text-[#788179]/60 resize-none leading-relaxed"
                  >${createDraft.description}</textarea>
                </div>
              </div>
            </section>

            <!-- ================= PASO 2: MONTO A RECAUDAR ================= -->
            <section class="bg-white p-6 md:p-8 rounded-3xl border border-[#eae5db] shadow-sm space-y-5">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-[#e8f1eb] text-[#4a7c59] flex items-center justify-center font-bold text-sm tabular-nums">2</span>
                <h3 class="font-heading text-lg font-bold text-[#191c1d] m-0">Monto a recaudar</h3>
              </div>

              <div class="bg-[#f5f1ea] p-5 rounded-2xl border border-[#eae5db] flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex-1">
                  <label class="text-xs font-bold uppercase tracking-wider text-[#5d645e] block mb-1" for="cowTargetInput">
                    Monto Objetivo
                  </label>
                  <div class="flex items-baseline gap-2">
                    <span class="font-heading font-bold text-3xl text-[#4a7c59]">$</span>
                    <input
                      id="cowTargetInput"
                      type="number"
                      min="1"
                      step="any"
                      required
                      value="${createDraft.targetAmount}"
                      placeholder="300000"
                      class="font-heading font-extrabold text-3xl text-[#191c1d] bg-transparent border-0 w-full focus:outline-none focus:ring-0 tracking-tight tabular-nums"
                    />
                    <span class="text-sm font-bold text-[#5d645e] font-mono">COP</span>
                  </div>
                </div>
              </div>

              <!-- Chips rápidos de meta -->
              <div class="flex items-center gap-2 flex-wrap">
                ${[100000, 200000, 300000, 500000, 1000000]
                  .map(
                    (val) => `
                    <button
                      type="button"
                      data-target-chip="${val}"
                      class="px-3.5 py-1.5 rounded-xl bg-[#f5f1ea] hover:bg-[#e8f1eb] text-[#191c1d] hover:text-[#20462c] border border-[#eae5db] text-xs font-bold font-heading tabular-nums transition-colors cursor-pointer"
                    >
                      ${formatCOP(val)}
                    </button>
                  `
                  )
                  .join("")}
              </div>
            </section>

            <!-- ================= PASO 3: TIPO DE VAQUITA Y PRIVACIDAD ================= -->
            <section class="bg-white p-6 md:p-8 rounded-3xl border border-[#eae5db] shadow-sm space-y-5">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-[#e8f1eb] text-[#4a7c59] flex items-center justify-center font-bold text-sm tabular-nums">3</span>
                <div>
                  <h3 class="font-heading text-lg font-bold text-[#191c1d] m-0">Tipo de Vaquita y Privacidad</h3>
                  <p class="text-xs text-[#5d645e] m-0">Elige la dinámica de transparencia de los aportes</p>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Opción 1: Pública -->
                <div
                  id="cardSelectPublic"
                  role="radio"
                  aria-checked="${isPublic}"
                  tabindex="0"
                  class="cursor-pointer relative p-5 rounded-2xl transition-all duration-200 border-2 ${
                    isPublic
                      ? "bg-[#f5f1ea] border-[#4a7c59] shadow-sm"
                      : "bg-[#f5f1ea]/60 hover:bg-[#f5f1ea] border-transparent"
                  }"
                >
                  <div class="flex items-start justify-between gap-2 mb-3">
                    <div class="w-10 h-10 rounded-xl ${
                      isPublic ? "bg-[#4a7c59] text-white" : "bg-[#eae5db] text-[#5d645e]"
                    } flex items-center justify-center shadow-sm">
                      <span class="material-symbols-outlined text-xl">groups</span>
                    </div>
                    ${
                      isPublic
                        ? `<span class="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#20462c] bg-[#c8e8d0] px-2.5 py-1 rounded-full">
                            <span class="material-symbols-outlined text-sm">check_circle</span>
                            Activa
                          </span>`
                        : ""
                    }
                  </div>
                  <h4 class="font-heading font-bold text-base text-[#191c1d] mb-1 m-0">Vaquita Pública</h4>
                  <p class="text-xs text-[#5d645e] leading-relaxed mb-3 m-0">
                    Visibilidad total de participantes y sus montos aportados. Cada quien ve en vivo cuánto sumó el resto.
                  </p>
                  <div class="pt-3 border-t border-[#eae5db] flex items-center gap-2 text-[11px] text-[#4a7c59] font-semibold">
                    <span class="material-symbols-outlined text-sm">hotel</span>
                    <span>Ideal para paseos, asados y arriendos grupales</span>
                  </div>
                </div>

                <!-- Opción 2: Privada / Anónima -->
                <div
                  id="cardSelectPrivate"
                  role="radio"
                  aria-checked="${!isPublic}"
                  tabindex="0"
                  class="cursor-pointer relative p-5 rounded-2xl transition-all duration-200 border-2 ${
                    !isPublic
                      ? "bg-[#f5f1ea] border-[#4a7c59] shadow-sm"
                      : "bg-[#f5f1ea]/60 hover:bg-[#f5f1ea] border-transparent"
                  }"
                >
                  <div class="flex items-start justify-between gap-2 mb-3">
                    <div class="w-10 h-10 rounded-xl ${
                      !isPublic ? "bg-[#4a7c59] text-white" : "bg-[#eae5db] text-[#5d645e]"
                    } flex items-center justify-center shadow-sm">
                      <span class="material-symbols-outlined text-xl">visibility_off</span>
                    </div>
                    ${
                      !isPublic
                        ? `<span class="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#20462c] bg-[#c8e8d0] px-2.5 py-1 rounded-full">
                            <span class="material-symbols-outlined text-sm">check_circle</span>
                            Activa
                          </span>`
                        : ""
                    }
                  </div>
                  <h4 class="font-heading font-bold text-base text-[#191c1d] mb-1 m-0">Vaquita Privada / Anónima</h4>
                  <p class="text-xs text-[#5d645e] leading-relaxed mb-3 m-0">
                    Aportes discretos y anónimos. Solo se visualiza la barra de progreso general y avisos de «Alguien ha aportado».
                  </p>
                  <div class="pt-3 border-t border-[#eae5db] flex items-center gap-2 text-[11px] text-[#8e5b22] font-semibold">
                    <span class="material-symbols-outlined text-sm">redeem</span>
                    <span>Ideal para regalos sorpresa y cuotas voluntarias</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- ================= PASO 4: PARTICIPANTES POR @LLAVE ================= -->
            <section class="bg-white p-6 md:p-8 rounded-3xl border border-[#eae5db] shadow-sm space-y-5">
              <div class="flex items-center justify-between gap-4 flex-wrap">
                <div class="flex items-center gap-3">
                  <span class="w-8 h-8 rounded-full bg-[#e8f1eb] text-[#4a7c59] flex items-center justify-center font-bold text-sm tabular-nums">4</span>
                  <div>
                    <h3 class="font-heading text-lg font-bold text-[#191c1d] m-0">Participantes</h3>
                    <p class="text-xs text-[#5d645e] m-0">Suma contactos mediante su @llave única</p>
                  </div>
                </div>
                <span class="bg-[#f5f1ea] text-[#191c1d] font-mono font-bold text-xs px-3 py-1.5 rounded-xl tabular-nums">
                  ${totalParticipants} ${totalParticipants === 1 ? "participante sumado" : "participantes sumados"}
                </span>
              </div>

              <!-- Barra para agregar llave -->
              <div class="flex flex-col sm:flex-row gap-2.5">
                <div class="relative flex-1">
                  <div class="absolute left-4 top-1/2 -translate-y-1/2 text-[#5d645e] pointer-events-none">
                    <span class="material-symbols-outlined text-xl">alternate_email</span>
                  </div>
                  <input
                    id="inviteKeyInput"
                    type="text"
                    maxlength="7"
                    placeholder="Ingresa llave única ej: @BOB222 o @CHA333"
                    class="w-full pl-11 pr-4 py-3 bg-[#f5f1ea] text-[#191c1d] text-sm rounded-xl border border-[#eae5db] focus:outline-none focus:bg-white focus:border-[#4a7c59] font-mono uppercase tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  id="btnAddInviteKey"
                  class="px-5 py-3 rounded-xl bg-[#4a7c59] hover:bg-[#3d6749] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer border-0"
                >
                  <span class="material-symbols-outlined text-base">person_add</span>
                  <span>Agregar</span>
                </button>
              </div>

              <!-- Contactos rápidos sugeridos -->
              ${
                availableContacts.length > 0
                  ? `<div class="flex items-center gap-2 flex-wrap">
                      <span class="text-xs text-[#5d645e] font-medium">Sugeridos:</span>
                      ${availableContacts
                        .map(
                          (u) => `
                          <button
                            type="button"
                            data-quick-invite="${u.userKey}"
                            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#f5f1ea] hover:bg-[#e8f1eb] border border-[#eae5db] text-xs font-semibold text-[#191c1d] transition-colors cursor-pointer"
                          >
                            <span class="font-mono font-bold text-[#4a7c59] tabular-nums">${u.userKey}</span>
                            <span class="text-[#5d645e]">(${u.shortName || u.name})</span>
                            <span class="text-[#4a7c59] font-bold">+</span>
                          </button>
                        `
                        )
                        .join("")}
                    </div>`
                  : ""
              }

              <!-- Lista de Participantes -->
              <div class="space-y-2.5">
                <!-- Creador / Organizador -->
                <div class="flex items-center justify-between p-3.5 rounded-2xl bg-[#f5f1ea]/80 border border-[#eae5db]">
                  <div class="flex items-center gap-3.5">
                    <div class="w-10 h-10 rounded-full bg-[#20462c] text-white flex items-center justify-center font-heading font-bold text-xs shadow-sm">
                      ${active.initials || "AT"}
                    </div>
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-sm text-[#191c1d]">${active.name || "Titular"}</span>
                        <span class="text-[10px] font-bold uppercase tracking-wider bg-[#e8f1eb] text-[#20462c] px-2 py-0.5 rounded-md">Organizador</span>
                      </div>
                      <div class="text-xs font-mono text-[#5d645e] tabular-nums">${active.userKey || "@ALI111"} • Cuenta anfitriona</div>
                    </div>
                  </div>
                  <div class="text-xs text-[#5d645e] font-semibold px-3 py-1 bg-white rounded-lg border border-[#eae5db]">
                    Responsable
                  </div>
                </div>

                <!-- Invitados agregados -->
                ${createDraft.invitedKeys
                  .map((k) => {
                    const matchedUser = users.find(
                      (u) => (u.userKey || "").toUpperCase() === k.toUpperCase()
                    );
                    const displayName = matchedUser ? matchedUser.name : k;
                    const initials = matchedUser
                      ? matchedUser.initials
                      : k.replace(/^@/, "").slice(0, 2);
                    return `
                      <div class="flex items-center justify-between p-3.5 rounded-2xl bg-[#f5f1ea]/40 hover:bg-[#f5f1ea] border border-[#eae5db]/70 transition-colors">
                        <div class="flex items-center gap-3.5">
                          <div class="w-10 h-10 rounded-full bg-[#e4e0d8] text-[#191c1d] flex items-center justify-center font-heading font-bold text-xs">
                            ${initials}
                          </div>
                          <div>
                            <div class="flex items-center gap-2">
                              <span class="font-bold text-sm text-[#191c1d]">${displayName}</span>
                              <span class="text-[10px] text-[#5d645e] font-medium">Invitado</span>
                            </div>
                            <div class="text-xs font-mono text-[#5d645e] tabular-nums">${k}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          data-remove-key="${k}"
                          class="btnRemoveInviteKey text-[#5d645e] hover:text-[#b83230] p-1.5 rounded-lg hover:bg-[#fdf2f2] transition-all cursor-pointer bg-transparent border-0"
                          title="Quitar ${k}"
                        >
                          <span class="material-symbols-outlined text-lg">close</span>
                        </button>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            </section>
          </div>

          <!-- COLUMNA DERECHA (4 cols): Tarjeta Sticky de Previsualización en Vivo -->
          <div class="lg:col-span-4">
            <div class="sticky top-24 space-y-6">
              <div class="bg-white p-6 rounded-3xl border border-[#eae5db] shadow-sm relative overflow-hidden">
                <!-- Cabecera visual de la tarjeta de previsualización -->
                <div class="relative h-24 -mx-6 -mt-6 mb-5 overflow-hidden rounded-t-3xl bg-gradient-to-tr from-[#20462c] via-[#4a7c59] to-[#659c76] p-5 flex items-center justify-between text-white">
                  <span class="text-[11px] font-bold uppercase tracking-widest bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-white">
                    Previsualización
                  </span>
                  <span class="material-symbols-outlined text-2xl text-white/90">eco</span>
                </div>

                <div class="space-y-4">
                  <div>
                    <span class="text-[11px] font-bold uppercase tracking-wider text-[#5d645e] block">Fondo Grupal</span>
                    <h4 class="font-heading font-bold text-xl text-[#191c1d] tracking-tight m-0" id="previewCowName">
                      ${createDraft.title.trim() || "Nombre de la Vaquita"}
                    </h4>
                  </div>

                  <div class="p-4 rounded-2xl bg-[#f5f1ea] space-y-3 border border-[#eae5db]">
                    <div class="flex justify-between items-baseline">
                      <span class="text-xs text-[#5d645e] font-medium">Meta a recolectar</span>
                      <span class="font-heading font-bold text-base text-[#191c1d] tabular-nums" id="previewCowTarget">
                        ${formatCOP(targetNum)} COP
                      </span>
                    </div>
                    <div class="w-full bg-[#eae5db] h-2.5 rounded-full overflow-hidden">
                      <div class="bg-[#4a7c59] h-full rounded-full w-0" style="width: 0%;"></div>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-[#5d645e] tabular-nums">
                      <span>0 aportes aún</span>
                      <span class="font-mono font-medium text-[#4a7c59]">0% completado</span>
                    </div>
                  </div>

                  <!-- Resumen clave-valor -->
                  <div class="space-y-2.5 text-xs pt-1">
                    <div class="flex items-center justify-between py-1.5 border-b border-[#eae5db]">
                      <span class="text-[#5d645e] flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-sm">visibility</span>
                        Privacidad
                      </span>
                      <span class="font-bold text-[#191c1d]">
                        ${isPublic ? "Pública (aportes visibles)" : "Privada (aportes anónimos)"}
                      </span>
                    </div>

                    <div class="flex items-center justify-between py-1.5 border-b border-[#eae5db]">
                      <span class="text-[#5d645e] flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-sm">group</span>
                        Participantes iniciales
                      </span>
                      <span class="font-bold text-[#191c1d] tabular-nums" id="previewCowCount">
                        ${totalParticipants} ${totalParticipants === 1 ? "integrante" : "integrantes"}
                      </span>
                    </div>

                    <div class="flex items-center justify-between py-1.5 border-b border-[#eae5db]">
                      <span class="text-[#5d645e] flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-sm">calculate</span>
                        Cuota estimada c/u
                      </span>
                      <span class="font-bold text-[#4a7c59] font-mono tabular-nums" id="previewCowQuota">
                        ${formatCOP(estimatedQuota)}
                      </span>
                    </div>
                  </div>

                  <!-- Botones CTA de Creación -->
                  <div class="pt-2 space-y-2.5">
                    <button
                      type="submit"
                      id="btnSubmitCreateCow"
                      ${isSubmitting ? "disabled" : ""}
                      class="w-full py-4 px-6 rounded-2xl bg-[#4a7c59] hover:bg-[#3d6749] text-white font-heading font-bold text-sm tracking-wide shadow-md shadow-[#4a7c59]/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99] group cursor-pointer border-0"
                    >
                      ${
                        isSubmitting
                          ? `<span class="bank-spinner"></span><span>Creando Vaquita…</span>`
                          : `<span>Crear Vaquita</span><span class="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">arrow_forward</span>`
                      }
                    </button>

                    <button
                      type="button"
                      id="btnCancelCreateCow"
                      class="w-full py-3 px-4 rounded-2xl text-[#5d645e] hover:text-[#191c1d] hover:bg-[#f5f1ea] font-bold text-xs uppercase tracking-wider transition-colors text-center cursor-pointer bg-transparent border-0"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>

              <!-- Tarjeta de Ayuda Rápida -->
              <div class="bg-[#f5f1ea] p-4 rounded-2xl border border-[#eae5db] text-xs space-y-1.5 text-[#5d645e]">
                <div class="flex items-center gap-2 font-bold text-[#191c1d]">
                  <span class="material-symbols-outlined text-[#4a7c59] text-base">help</span>
                  <span>¿Cómo invitar a tus amigos?</span>
                </div>
                <p class="leading-relaxed m-0">
                  Agrega a tus contactos usando su llave única <strong class="font-mono text-[#191c1d]">@ABC123</strong>. La vaquita se vinculará de inmediato en su tablero personal.
                </p>
              </div>
            </div>
          </div>

        </form>
      </div>
    `;

    bindCreateFullScreenEvents(state);
  }

  /**
   * Enlaza eventos de la vista de listado de Vaquitas.
   */
  function bindListEvents(allCows) {
    container.querySelectorAll(".cows-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTabFilter = btn.getAttribute("data-tab") || "all";
        render(store.getState());
      });
    });

    const searchInput = container.querySelector("#cowSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        render(store.getState());
        const refreshedInput = container.querySelector("#cowSearchInput");
        if (refreshedInput) {
          refreshedInput.focus();
          refreshedInput.setSelectionRange(searchQuery.length, searchQuery.length);
        }
      });
    }

    const openCreator = () => {
      createDraft = {
        title: "",
        description: "",
        targetAmount: "300000",
        visibilityType: "PUBLIC",
        invitedKeys: [],
      };
      viewMode = "create";
      render(store.getState());
    };

    const btnOpenCreateCow = container.querySelector("#btnOpenCreateCow");
    if (btnOpenCreateCow) {
      btnOpenCreateCow.addEventListener("click", openCreator);
    }
    container.querySelectorAll(".btnTriggerCreateCow").forEach((b) => {
      b.addEventListener("click", openCreator);
    });

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
   * Enlaza eventos de la vista a pantalla completa «Crear Nueva Vaquita».
   */
  function bindCreateFullScreenEvents(state) {
    const active = state.activeUser || {};
    const backToList = () => {
      viewMode = "list";
      render(store.getState());
    };

    const btnBack = container.querySelector("#btnBackToCowsList");
    const btnCancel = container.querySelector("#btnCancelCreateCow");
    if (btnBack) btnBack.addEventListener("click", backToList);
    if (btnCancel) btnCancel.addEventListener("click", backToList);

    const titleInput = container.querySelector("#cowTitleInput");
    const descInput = container.querySelector("#cowDescInput");
    const targetInput = container.querySelector("#cowTargetInput");
    const nameCounter = container.querySelector("#nameCounter");
    const previewName = container.querySelector("#previewCowName");
    const previewTarget = container.querySelector("#previewCowTarget");
    const previewQuota = container.querySelector("#previewCowQuota");

    if (titleInput) {
      titleInput.addEventListener("input", (e) => {
        createDraft.title = e.target.value;
        if (nameCounter) nameCounter.textContent = `${createDraft.title.length}/40`;
        if (previewName) {
          previewName.textContent = createDraft.title.trim() || "Nombre de la Vaquita";
        }
      });
    }

    if (descInput) {
      descInput.addEventListener("input", (e) => {
        createDraft.description = e.target.value;
      });
    }

    const updateLiveTargetPreview = () => {
      const num = Math.max(0, Number(createDraft.targetAmount) || 0);
      const count = createDraft.invitedKeys.length + 1;
      const quota = count > 0 ? Math.round(num / count) : num;
      if (previewTarget) previewTarget.textContent = `${formatCOP(num)} COP`;
      if (previewQuota) previewQuota.textContent = formatCOP(quota);
    };

    if (targetInput) {
      targetInput.addEventListener("input", (e) => {
        createDraft.targetAmount = e.target.value;
        updateLiveTargetPreview();
      });
    }

    container.querySelectorAll("[data-target-chip]").forEach((chip) => {
      chip.addEventListener("click", () => {
        createDraft.targetAmount = chip.getAttribute("data-target-chip") || "300000";
        render(store.getState());
      });
    });

    const cardPublic = container.querySelector("#cardSelectPublic");
    const cardPrivate = container.querySelector("#cardSelectPrivate");
    if (cardPublic) {
      cardPublic.addEventListener("click", () => {
        createDraft.visibilityType = "PUBLIC";
        render(store.getState());
      });
    }
    if (cardPrivate) {
      cardPrivate.addEventListener("click", () => {
        createDraft.visibilityType = "ANONYMOUS";
        render(store.getState());
      });
    }

    const inviteKeyInput = container.querySelector("#inviteKeyInput");
    const btnAddInviteKey = container.querySelector("#btnAddInviteKey");

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
        showToast(
          "La llave debe iniciar con @ seguida de 3 letras y 3 números (ej. @BOB222)",
          "warning"
        );
        return false;
      }
      if (active.userKey && clean === active.userKey.toUpperCase()) {
        showToast("Ya eres el organizador de esta vaquita", "warning");
        return false;
      }
      if (!createDraft.invitedKeys.includes(clean)) {
        createDraft.invitedKeys.push(clean);
      }
      if (inviteKeyInput) inviteKeyInput.value = "";
      render(store.getState());
      return true;
    }

    if (btnAddInviteKey && inviteKeyInput) {
      btnAddInviteKey.addEventListener("click", () => {
        tryAddKey(inviteKeyInput.value, false);
      });
      inviteKeyInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          tryAddKey(inviteKeyInput.value, false);
        }
      });
    }

    container.querySelectorAll("[data-quick-invite]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-quick-invite");
        if (key) tryAddKey(key, true);
      });
    });

    container.querySelectorAll(".btnRemoveInviteKey").forEach((btn) => {
      btn.addEventListener("click", () => {
        const keyToRemove = btn.getAttribute("data-remove-key");
        createDraft.invitedKeys = createDraft.invitedKeys.filter((k) => k !== keyToRemove);
        render(store.getState());
      });
    });

    const form = container.querySelector("#createCowFullForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        if (inviteKeyInput && inviteKeyInput.value.trim()) {
          const ok = tryAddKey(inviteKeyInput.value, true);
          if (!ok) return;
        }

        const title = createDraft.title.trim();
        const desc = createDraft.description.trim();
        const target = Number(createDraft.targetAmount);

        if (!title) {
          showToast("El nombre de la vaquita es obligatorio", "warning");
          return;
        }
        if (isNaN(target) || target <= 0) {
          showToast("El monto objetivo debe ser estrictamente positivo", "warning");
          return;
        }

        isSubmitting = true;
        render(store.getState());

        try {
          await api.createCow(
            title,
            desc,
            target,
            createDraft.visibilityType,
            null,
            createDraft.invitedKeys
          );
          showToast(`Vaquita "${title}" creada con éxito`, "success");
          viewMode = "list";
          await loadCows();
        } catch (err) {
          showToast(err.message, "error");
        } finally {
          isSubmitting = false;
          render(store.getState());
        }
      });
    }
  }

  // ========================================================================
  // MODALES CONTEXTUALES TERRA (Aportar, Terminar/Cancelar, Invitados/Aportes)
  // ========================================================================

  function getModalRoot() {
    return container.querySelector("#cowModalRoot");
  }

  function closeModal() {
    const root = getModalRoot();
    if (root) root.innerHTML = "";
  }

  /**
   * Modal 1: Aportar a una Vaquita con validación reactiva de saldo disponible.
   */
  function openContributeModal(cow) {
    const root = getModalRoot();
    if (!root) return;
    const balance = store.getState().balance || 0;
    const remaining = Math.max(0, cow.target_amount - cow.collected_amount);

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content">
          <div class="modal-head">
            <h3 class="modal-title">Aportar a ${cow.title}</h3>
            <button type="button" class="btn-icon btnModalClose" aria-label="Cerrar">
              <span class="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          <div class="p-4 rounded-2xl bg-[#f5f1ea] border border-[#eae5db] space-y-2 mb-5">
            <div class="kv">
              <span class="text-[#5d645e] font-medium">Tu saldo disponible</span>
              <strong class="tabular-nums text-[#191c1d]">${formatCOP(balance)}</strong>
            </div>
            <div class="kv">
              <span class="text-[#5d645e] font-medium">Falta para la meta</span>
              <strong class="tabular-nums text-[#4a7c59]">${formatCOP(remaining)}</strong>
            </div>
          </div>

          <form id="contributeForm" class="space-y-4">
            <div>
              <label class="bank-label" for="contribAmount">Monto a aportar (COP)</label>
              <div class="relative flex items-center rounded-2xl bg-[#f5f1ea] border border-[#eae5db] px-4 py-3.5 focus-within:border-[#4a7c59] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#4a7c59]/20 transition-all">
                <span class="font-heading font-bold text-xl text-[#4a7c59] mr-2 select-none">$</span>
                <input
                  id="contribAmount"
                  class="w-full bg-transparent border-0 font-heading font-bold text-xl text-[#191c1d] focus:outline-none focus:ring-0 tabular-nums"
                  type="number"
                  min="1"
                  max="${remaining > 0 ? remaining : ""}"
                  step="any"
                  required
                />
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Cancelar</button>
              <button type="submit" id="btnSubmitContrib" class="bank-btn bank-btn-primary" ${isSubmitting ? "disabled" : ""}>
                ${isSubmitting ? `<span class="bank-spinner"></span> Procesando…` : "Confirmar aporte"}
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

      if (remaining <= 0 || cow.status === "COMPLETED") {
        showToast("Esta vaquita ya alcanzó el 100% de su meta y está cerrada", "warning");
        return;
      }

      if (isNaN(amount) || amount <= 0) {
        showToast("El monto debe ser estrictamente positivo", "warning");
        return;
      }

      if (amount > remaining) {
        showToast(`El aporte no puede superar lo que falta para la meta (${formatCOP(remaining)})`, "warning");
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
   * Modal 2: Terminar Vaquita (desembolso al creador) o Cancelar con reembolsos compensatorios.
   */
  function openDisburseModal(cow) {
    const root = getModalRoot();
    if (!root) return;
    const hasFunds = cow.collected_amount > 0;

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content">
          <div class="modal-head">
            <h3 class="modal-title">Terminar Vaquita: ${cow.title}</h3>
            <button type="button" class="btn-icon btnModalClose" aria-label="Cerrar">
              <span class="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          <p class="text-sm text-[#5d645e] mb-3">
            ${
              hasFunds
                ? "El total recaudado en la bóveda se transferirá de forma atómica a tu cuenta personal y la vaquita pasará al historial:"
                : "No hay dinero recaudado ($0). Se cerrará la vaquita y se archivará en el historial:"
            }
          </p>
          <div class="p-4 rounded-2xl bg-[#e8f1eb] text-[#20462c] font-heading font-extrabold text-3xl tabular-nums text-center mb-4">
            ${formatCOP(cow.collected_amount)}
          </div>

          <div class="modal-actions flex-wrap">
            <button type="button" class="bank-btn bank-btn-secondary btnModalClose">Volver</button>
            ${
              hasFunds
                ? `<button type="button" id="btnCancelRefundCow" class="bank-btn bank-btn-danger" ${isSubmitting ? "disabled" : ""}>
                    Cancelar y reembolsar
                  </button>`
                : ""
            }
            <button type="button" id="btnConfirmDisburse" class="bank-btn bank-btn-primary" ${isSubmitting ? "disabled" : ""}>
              ${isSubmitting ? `<span class="bank-spinner"></span> Procesando…` : "Terminar y recibir fondos"}
            </button>
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll(".btnModalClose").forEach((b) => b.addEventListener("click", closeModal));

    const btnConfirm = root.querySelector("#btnConfirmDisburse");
    if (btnConfirm) {
      btnConfirm.addEventListener("click", async () => {
        isSubmitting = true;
        btnConfirm.disabled = true;

        try {
          await api.disburseCow(cow.id);
          showToast(
            hasFunds
              ? `Vaquita terminada: ${formatCOP(cow.collected_amount)} transferidos a tu cuenta`
              : `Vaquita "${cow.title}" terminada y guardada en el historial`,
            "success"
          );
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

    const btnCancelRefund = root.querySelector("#btnCancelRefundCow");
    if (btnCancelRefund) {
      btnCancelRefund.addEventListener("click", async () => {
        isSubmitting = true;
        btnCancelRefund.disabled = true;

        try {
          await api.cancelCow(cow.id);
          showToast(`Vaquita cancelada y aportes reembolsados a los participantes`, "info");
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
  }

  /**
   * Modal 3: Detalle de participantes y aportes respetando la política Zero-Trust (Pública vs Privada).
   */
  function openMembersModal(cow) {
    const root = getModalRoot();
    if (!root) return;
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
        ? "Invitados y aportes anónimos"
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
                        <span class="flex items-center gap-3">
                          <span class="avatar ${isMe ? "avatar-active" : ""}">${(m.full_name || "US").slice(0, 2).toUpperCase()}</span>
                          <span>
                            <strong class="font-bold text-[#191c1d] block">${m.full_name}</strong>
                            <span class="muted text-xs">${[isMe ? "Tú" : "", m.role === "CREATOR" ? "Organizador" : "Invitado"].filter(Boolean).join(" · ")}</span>
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
      const contributionsListHtml = `
        <div>
          ${isCreator ? `<div class="bank-label mb-2">Avisos anónimos (${contributions.length})</div>` : ""}
          <div class="row-list">
            ${
              contributions.length === 0
                ? `<div class="row-item muted">Aún no se han recibido aportes.</div>`
                : contributions
                    .map(
                      (c) => `
                      <div class="row-item">
                        <span class="flex items-center gap-3">
                          <span class="avatar bg-[#e8f1eb] text-[#4a7c59]">+</span>
                          <span>
                            Alguien ha aportado <strong class="tabular-nums">${formatCOP(c.amount)}</strong>
                          </span>
                        </span>
                        <span class="muted tabular-nums text-xs">${formatDate(c.created_at)}</span>
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
            <div class="bank-label mb-2">Personas invitadas (${members.length})</div>
            <div class="row-list">
              ${members
                .map((m) => {
                  const isMe = m.user_id === active.id;
                  return `
                    <div class="row-item">
                      <span class="flex items-center gap-3">
                        <span class="avatar ${isMe ? "avatar-active" : ""}">${(m.full_name || "US").slice(0, 2).toUpperCase()}</span>
                        <span>
                          <strong class="font-bold text-[#191c1d] block">${m.full_name}</strong>
                          <span class="muted text-xs">${[isMe ? "Tú" : "", m.role === "CREATOR" ? "Organizador" : "Invitado"].filter(Boolean).join(" · ")}</span>
                        </span>
                      </span>
                      <span class="muted text-xs tabular-nums">${isMe && m.amount_contributed !== null ? `Tu aporte: ${formatCOP(m.amount_contributed)}` : "Monto protegido (null)"}</span>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        `
        : "";

      bodyHtml = `<div class="space-y-4">${contributionsListHtml}${creatorInviteesHtml}</div>`;
    }

    root.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content">
          <div class="modal-head">
            <div>
              <h3 class="modal-title">${modalTitle}</h3>
              <span class="muted text-xs">${modalSubtitle}</span>
            </div>
            <button type="button" class="btn-icon btnModalClose" aria-label="Cerrar">
              <span class="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          ${bodyHtml}

          <div class="kv mt-5 pt-3 border-t border-[#eae5db]">
            <span class="muted font-semibold">Total recaudado</span>
            <strong class="tabular-nums text-lg font-heading text-[#191c1d]">${formatCOP(
              cow.status === "DISBURSED" || cow.status === "CANCELLED"
                ? cow.total_raised ?? cow.collected_amount
                : cow.collected_amount
            )}</strong>
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll(".btnModalClose").forEach((b) => b.addEventListener("click", closeModal));
  }

  let currentUserId = store.getActiveUser()?.id;
  loadCows();
  render(store.getState());

  store.subscribe((state) => {
    const newUserId = state.activeUser?.id;
    if (newUserId && newUserId !== currentUserId) {
      currentUserId = newUserId;
      viewMode = "list";
      loadCows();
    }
    render(state);
  });
}
