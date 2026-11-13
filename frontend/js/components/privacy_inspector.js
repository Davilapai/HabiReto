/**
 * Inspector de Privacidad Zero-Trust para Vaqui (HabiReto).
 *
 * Implementa la sección de auditoría criptográfica de Stitch en la vista de Vaquitas,
 * evidenciando en vivo que en los fondos privados (`ANONYMOUS`) el servidor sanitiza
 * los campos sensibles (`amount_contributed: null`, `contributor_name: null`) directamente
 * en la respuesta HTTP antes de serializar el JSON.
 */

import { api } from "../api.js";
import { store } from "../state.js";

/**
 * Inicializa el inspector de privacidad Zero-Trust en el contenedor indicado.
 *
 * @param {string} containerId - Identificador del contenedor raíz en el DOM.
 */
export function initPrivacyInspector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let currentCow = null;
  let isExpanded = true;
  let lastKey = null;

  /**
   * Consulta el detalle de la primera vaquita privada disponible cuando cambia
   * el usuario activo o el monto recaudado del fondo.
   *
   * @param {boolean} [force=false] - Fuerza la petición HTTP aunque la clave no haya variado.
   */
  async function inspectAnonymousCow(force = false) {
    const cows = store.getState().cows || [];
    const anonCow = cows.find((c) => c.visibility_type === "ANONYMOUS");
    const active = store.getActiveUser();
    const key = anonCow ? `${active?.id}:${anonCow.id}:${anonCow.collected_amount}` : null;

    if (!anonCow) {
      currentCow = null;
      lastKey = null;
      render();
      return;
    }

    if (!isExpanded || (!force && key === lastKey && currentCow)) {
      render();
      return;
    }

    lastKey = key;
    try {
      currentCow = await api.getCowDetail(anonCow.id);
    } catch (_err) {
      // Si el usuario activo no tiene visibilidad sobre la vaquita, se conserva el estado previo
    } finally {
      render();
    }
  }

  /**
   * Construye el bloque JSON coloreado para demostrar la sanitización de campos en el servidor.
   *
   * @param {Object} cow - Detalle de la vaquita privada retornado por el backend.
   * @returns {string} HTML con el payload JSON formateado.
   */
  function formatHighlightedPayload(cow) {
    const members = (cow.members || []).slice(0, 3).map((m) => {
      const amt =
        m.amount_contributed === null || m.amount_contributed === undefined
          ? `<span class="text-rose-400 font-bold">null</span> <span class="text-slate-500">// Sanitizado por política ANONYMOUS</span>`
          : `<span class="text-amber-300 tabular-nums">${m.amount_contributed}</span>`;
      return `    {\n      <span class="text-sky-300">"full_name"</span>: <span class="text-emerald-300">"${m.full_name}"</span>,\n      <span class="text-sky-300">"amount_contributed"</span>: ${amt}\n    }`;
    });

    const contributions = (cow.contributions || []).slice(0, 3).map((c) => {
      const cname =
        c.contributor_name === null || c.contributor_name === undefined
          ? `<span class="text-rose-400 font-bold">null</span> <span class="text-slate-500">// Identidad protegida en servidor</span>`
          : `<span class="text-emerald-300">"${c.contributor_name}"</span>`;
      return `    {\n      <span class="text-sky-300">"amount"</span>: <span class="text-amber-300 tabular-nums">${c.amount}</span>,\n      <span class="text-sky-300">"contributor_name"</span>: ${cname}\n    }`;
    });

    return `{
  <span class="text-sky-300">"title"</span>: <span class="text-emerald-300">"${cow.title}"</span>,
  <span class="text-sky-300">"visibility_type"</span>: <span class="text-amber-300">"${cow.visibility_type}"</span>,
  <span class="text-sky-300">"collected_amount"</span>: <span class="text-amber-300 tabular-nums">${cow.collected_amount}</span>,
  <span class="text-sky-300">"members"</span>: [
${members.join(",\n")}
  ],
  <span class="text-sky-300">"contributions"</span>: [
${contributions.join(",\n")}
  ]
}`;
  }

  /**
   * Renderiza el componente de auditoría Zero-Trust siguiendo el diseño Stitch Terra.
   */
  function render() {
    const cows = store.getState().cows || [];
    const anonCow = cows.find((c) => c.visibility_type === "ANONYMOUS");
    const active = store.getActiveUser();

    const endpointPath = currentCow
      ? `/api/v1/cows/${String(currentCow.id).substring(0, 13)}...`
      : anonCow
      ? `/api/v1/cows/${String(anonCow.id).substring(0, 13)}...`
      : `/api/v1/cows/{id-privada}`;

    container.innerHTML = `
      <div class="pt-4">
        <div class="border border-[#eae5db] bg-white rounded-3xl p-6 shadow-sm space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-[#e8f1eb] text-[#4a7c59] flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[20px]">security</span>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-sm font-bold text-[#171d1a] font-headline">Ver privacidad en el servidor (Zero-Trust)</h3>
                  <span class="text-[10px] font-bold bg-[#f5f1ea] text-[#5e6660] px-2 py-0.5 rounded border border-[#eae5db] font-mono">API v1 verified</span>
                </div>
                <p class="text-xs text-[#5e6660]">
                  Demostración de anonimización garantizada en backend para <strong class="text-[#171d1a]">${active ? active.name : "Usuario"}</strong>
                </p>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <span class="text-xs font-semibold text-[#4a7c59] flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-[#4a7c59] animate-pulse"></span>
                Respuesta en vivo del servidor
              </span>
              <button
                type="button"
                id="btnTogglePrivacyInspector"
                class="px-3 py-1.5 rounded-xl bg-[#f5f1ea] hover:bg-[#ebe5db] text-xs font-bold text-[#171d1a] transition-colors inline-flex items-center gap-1"
              >
                <span>${isExpanded ? "Ocultar JSON" : "Ver JSON"}</span>
                <span class="material-symbols-outlined text-[16px]">${isExpanded ? "expand_less" : "expand_more"}</span>
              </button>
            </div>
          </div>

          ${
            isExpanded
              ? !anonCow
                ? `
                  <div class="bg-[#171b26] rounded-2xl p-5 text-xs font-mono text-gray-300 border border-[#0f131d]">
                    <p class="text-slate-400">Crea una Vaquita Privada (ANONYMOUS) para inspeccionar en vivo cómo el servidor oculta los montos individuales en el payload HTTP.</p>
                  </div>
                `
                : !currentCow
                ? `
                  <div class="bg-[#171b26] rounded-2xl p-5 text-xs font-mono text-gray-300 border border-[#0f131d]">
                    <p class="text-slate-400">Consultando payload sanitizado desde PostgreSQL / FastAPI...</p>
                  </div>
                `
                : `
                  <div class="bg-[#171b26] rounded-2xl p-4 text-xs font-mono text-gray-300 overflow-x-auto shadow-inner border border-[#0f131d]">
                    <div class="flex items-center justify-between pb-2.5 mb-3 border-b border-gray-800 text-[11px] text-gray-400">
                      <span class="flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-bold border border-emerald-800">GET</span>
                        <span class="tabular-nums">${endpointPath}</span>
                      </span>
                      <span class="tabular-nums">HTTP/2 200 OK • vista de ${active ? active.userKey : "@USER"}</span>
                    </div>
                    <pre class="leading-relaxed text-[11px] overflow-x-auto">${formatHighlightedPayload(currentCow)}</pre>
                  </div>
                `
              : ""
          }
        </div>
      </div>
    `;

    const btnToggle = container.querySelector("#btnTogglePrivacyInspector");
    if (btnToggle) {
      btnToggle.addEventListener("click", () => {
        isExpanded = !isExpanded;
        if (isExpanded) {
          inspectAnonymousCow(true);
        } else {
          render();
        }
      });
    }
  }

  inspectAnonymousCow(true);
  store.subscribe(() => inspectAnonymousCow(false));
}
