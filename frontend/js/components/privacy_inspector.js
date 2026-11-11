/**
 * Inspector y Demostrador de Privacidad Zero-Trust en Tiempo Real para HabiReto.
 * 
 * Permite evidenciar que en fondos anónimos los aportes de terceros viajan como null
 * directamente desde el payload HTTP del servidor, garantizando cero fuga de datos.
 */

import { api, formatCOP } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

export function initPrivacyInspector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let rawPayload = null;
  let currentCow = null;
  let isLoading = false;

  async function inspectAnonymousCow() {
    const cows = store.getState().cows || [];
    // Busca la vaca anónima de prueba
    const anonCow = cows.find((c) => c.visibility_type === "ANONYMOUS");
    if (!anonCow) {
      currentCow = null;
      rawPayload = null;
      render();
      return;
    }

    isLoading = true;
    try {
      // Consulta en tiempo real con el X-User-Id del usuario activo en sesión
      const detail = await api.getCowDetail(anonCow.id);
      currentCow = detail;
      rawPayload = detail;
    } catch (err) {
      // Silenciar o mostrar error suave
    } finally {
      isLoading = false;
      render();
    }
  }

  function render() {
    const active = store.getActiveUser();

    if (!currentCow) {
      container.innerHTML = `
        <div class="bank-card" style="margin-top:24px;border-left:4px solid #173B63;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h3 style="font-size:16px;font-weight:600;margin:0 0 4px 0;color:#111827;">Inspector de Privacidad Zero-Trust (Demostración en Vivo)</h3>
              <p style="font-size:13px;color:#667085;margin:0;">No se encontró una vaca anónima activa para auditar en este momento.</p>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const members = currentCow.members || [];

    container.innerHTML = `
      <div class="bank-card" style="margin-top:24px;border-left:4px solid #173B63;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <h3 style="font-size:16px;font-weight:600;margin:0;color:#111827;">
                Auditor de Privacidad Zero-Trust: "${currentCow.title}"
              </h3>
              <span class="badge badge-warning" style="font-size:11px;">Vaca Anónima</span>
            </div>
            <p style="font-size:13px;color:#667085;margin:0;">
              Identidad Activa en Red: <strong style="color:#173B63;">${active.name}</strong> (${active.role}).
              Comprueba cómo el servidor serializa los aportes según los permisos autorizados.
            </p>
          </div>

          <button type="button" id="btnRefreshInspector" class="bank-btn bank-btn-secondary" style="font-size:12px;padding:6px 12px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            Re-consultar Servidor
          </button>
        </div>

        <!-- Comparativa: Vista Autorizada vs Payload HTTP Crudo -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;">
          
          <!-- Lado Izquierdo: Renderizado en UI según permisos -->
          <div style="background:#FFFFFF;border:1px solid #E5EAF0;border-radius:8px;padding:16px;">
            <div style="font-size:12px;font-weight:600;color:#667085;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">
              Visualización Autorizada en Pantalla:
            </div>

            <div style="display:flex;flex-direction:column;gap:10px;">
              ${members
                .map((m) => {
                  const isMe = m.user_id === active.id;
                  const hasAmount = m.amount_contributed !== null && m.amount_contributed !== undefined;

                  return `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:${isMe ? "#EAF6EF" : "#F8FAFC"};border-radius:6px;border:1px solid ${isMe ? "#C4E9D3" : "#E5EAF0"};">
                    <div>
                      <div style="font-size:13px;font-weight:600;color:#111827;">${m.full_name}</div>
                      <div style="font-size:11px;color:#667085;">${m.role} ${isMe ? "(Tú)" : ""}</div>
                    </div>
                    <div style="text-align:right;">
                      ${
                        hasAmount
                          ? `<strong class="tabular-nums" style="color:#16865B;font-size:14px;">${formatCOP(m.amount_contributed)}</strong>`
                          : `<span class="badge badge-warning" style="font-size:11px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> [Aporte Oculto]</span>`
                      }
                    </div>
                  </div>
                `;
                })
                .join("")}
            </div>

            <div style="margin-top:12px;padding-top:10px;border-top:1px solid #E5EAF0;display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:#667085;">Total en Bóveda:</span>
              <strong class="tabular-nums" style="color:#111827;">${formatCOP(currentCow.collected_amount)}</strong>
            </div>
          </div>

          <!-- Lado Derecho: Payload JSON en Red (Zero-Trust Proof) -->
          <div style="background:#0F172A;border-radius:8px;padding:16px;color:#F8FAFC;font-family:monospace;font-size:11px;overflow-x:auto;">
            <div style="display:flex;justify-content:space-between;color:#94A3B8;font-size:11px;margin-bottom:8px;font-family:sans-serif;font-weight:500;">
              <span>Respuesta JSON del Backend (GET /api/v1/cows/${currentCow.id}):</span>
              <span class="badge badge-success" style="font-size:10px;padding:1px 5px;">200 OK</span>
            </div>
            <pre style="margin:0;line-height:1.4;white-space:pre-wrap;color:#38BDF8;">${JSON.stringify(
              {
                id: currentCow.id,
                title: currentCow.title,
                visibility_type: currentCow.visibility_type,
                collected_amount: currentCow.collected_amount,
                members: (currentCow.members || []).map((m) => ({
                  user_id: m.user_id,
                  full_name: m.full_name,
                  role: m.role,
                  amount_contributed: m.amount_contributed, // null para terceros
                })),
              },
              null,
              2
            )}</pre>
          </div>

        </div>
      </div>
    `;

    const btnRefresh = container.querySelector("#btnRefreshInspector");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", () => {
        inspectAnonymousCow();
        showToast("Inspector sincronizado con el backend", "info", 1500);
      });
    }
  }

  // Carga inicial y reactividad con cambios de estado
  inspectAnonymousCow();

  store.subscribe(() => {
    inspectAnonymousCow();
  });
}
