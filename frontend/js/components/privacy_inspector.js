/**
 * Inspector de Privacidad Zero-Trust para HabiReto.
 *
 * Permite evidenciar que en fondos anónimos los aportes de terceros viajan como null
 * directamente desde el payload HTTP del servidor, garantizando cero fuga de datos.
 *
 * Es una herramienta de demostración secundaria: se presenta como un bloque plegable
 * (`<details>`) cerrado por defecto para no competir con las tareas principales.
 */

import { api } from "../api.js";
import { store } from "../state.js";

/**
 * Inicializa el inspector en el contenedor indicado.
 *
 * @param {string} containerId - Identificador del contenedor raíz.
 */
export function initPrivacyInspector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let currentCow = null;
  let isOpen = false;
  // Clave de la última consulta (usuario + vaca + monto). Evita repetir la petición
  // HTTP en cada cambio de estado global; solo se re-consulta si algo relevante cambió.
  let lastKey = null;

  /**
   * Consulta el detalle de la primera vaca anónima visible, solo si el bloque está abierto
   * y los datos relevantes cambiaron desde la última consulta.
   *
   * @param {boolean} [force=false] - Fuerza la consulta aunque la clave no haya cambiado.
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
    if (!isOpen || (!force && key === lastKey)) {
      render();
      return;
    }

    lastKey = key;
    try {
      currentCow = await api.getCowDetail(anonCow.id);
    } catch (err) {
      // Sin permisos o no disponible: se mantiene el último resultado conocido.
    } finally {
      render();
    }
  }

  /**
   * Pinta el bloque plegable con el payload enmascarado devuelto por el servidor.
   */
  function render() {
    const hasAnon = (store.getState().cows || []).some((c) => c.visibility_type === "ANONYMOUS");

    const body = !hasAnon
      ? `<p class="muted" style="margin:0;">Crea una vaquita privada para ver cómo el servidor oculta los aportes de otros.</p>`
      : !currentCow
      ? `<p class="muted" style="margin:0;">Cargando…</p>`
      : `
        <p class="muted" style="margin:0 0 12px;">
          Respuesta de <code>GET /api/v1/cows/${currentCow.id}</code> para ${store.getActiveUser().name}.
          Solo el creador recibe <code>members</code>; los aportes viajan sin identidad en <code>contributions</code>.
        </p>
        <pre class="code-block">${JSON.stringify(
          {
            title: currentCow.title,
            visibility_type: currentCow.visibility_type,
            collected_amount: currentCow.collected_amount,
            members: (currentCow.members || []).map((m) => ({
              full_name: m.full_name,
              amount_contributed: m.amount_contributed,
            })),
            contributions: (currentCow.contributions || []).map((c) => ({
              amount: c.amount,
              contributor_name: c.contributor_name,
            })),
          },
          null,
          2
        )}</pre>
      `;

    container.innerHTML = `
      <details class="disclosure" style="margin-top:32px;" ${isOpen ? "open" : ""}>
        <summary>Ver privacidad en el servidor</summary>
        <div class="disclosure-body">${body}</div>
      </details>
    `;

    // Los navegadores emiten `toggle` también al recrear un <details> ya abierto;
    // se ignora si el estado no cambió para no entrar en un ciclo de re-consultas.
    container.querySelector("details").addEventListener("toggle", (e) => {
      if (e.target.open === isOpen) return;
      isOpen = e.target.open;
      if (isOpen) inspectAnonymousCow(true);
    });
  }

  render();

  store.subscribe(() => inspectAnonymousCow());
}
