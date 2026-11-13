/**
 * Indicador de identidad activa y acceso rápido en la cabecera superior para HabiReto / Vaqui.
 *
 * Renderiza el botón «Registrar persona» y el chip de perfil del titular activo
 * (nombre, llave única @ABC123 y avatar con indicador de sesión), enlazándolos
 * directamente con la vista dedicada de Configuración y Selector de Cuenta.
 */

import { store } from "../state.js";

/**
 * Inicializa el indicador de identidad en la barra superior de la aplicación.
 *
 * @param {string} containerId - Identificador del contenedor DOM en el header.
 */
export function initIdentitySelector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  /**
   * Renderiza los controles de cabecera con los datos del usuario activo.
   *
   * @param {Object} state - Estado global reactivo.
   */
  function render(state) {
    const active = state.activeUser || {};
    const fullName = active.name || "Alice Titular";
    const userKey = active.userKey || "@ALI111";
    const initials = active.initials || "AT";

    container.innerHTML = `
      <div class="flex items-center gap-4">
        <button
          type="button"
          id="btnQuickRegister"
          class="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#eae5db] bg-white hover:bg-[#f5f1ea] text-[#191c1d] text-sm font-semibold transition-all shadow-sm cursor-pointer"
          title="Registrar nueva persona"
        >
          <span class="material-symbols-outlined text-lg text-[#4a7c59]">person_add</span>
          <span>Registrar persona</span>
        </button>

        <div class="h-6 w-[1px] bg-[#eae5db]" aria-hidden="true"></div>

        <button
          type="button"
          id="btnSwitchPersona"
          class="flex items-center gap-3 pl-1 pr-1.5 py-1 rounded-2xl hover:bg-[#f5f1ea]/80 transition-colors cursor-pointer bg-transparent border-0 text-right"
          title="Cambiar de cuenta o ver configuración"
        >
          <div class="text-right">
            <div class="font-heading font-bold text-sm text-[#191c1d] leading-snug">${fullName}</div>
            <div class="text-xs text-[#4a7c59] font-mono font-medium tabular-nums">${userKey}</div>
          </div>
          <div class="relative">
            <div class="w-10 h-10 rounded-full bg-[#20462c] text-white flex items-center justify-center font-heading font-bold text-sm shadow-sm ring-2 ring-white">
              ${initials}
            </div>
            <span class="absolute bottom-0 right-0 w-3 h-3 bg-[#4a7c59] border-2 border-white rounded-full"></span>
          </div>
        </button>
      </div>
    `;

    const btnRegister = container.querySelector("#btnQuickRegister");
    const btnSwitch = container.querySelector("#btnSwitchPersona");

    if (btnRegister) {
      btnRegister.addEventListener("click", () => {
        window.dispatchEvent(
          new CustomEvent("vaqui:navigate", {
            detail: { view: "settings", focus: "register" },
          })
        );
      });
    }

    if (btnSwitch) {
      btnSwitch.addEventListener("click", () => {
        window.dispatchEvent(
          new CustomEvent("vaqui:navigate", {
            detail: { view: "settings", focus: "switch" },
          })
        );
      });
    }
  }

  render(store.getState());
  store.subscribe(render);
}
