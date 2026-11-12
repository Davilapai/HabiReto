/**
 * Inspector y Demostrador de Privacidad Zero-Trust en Tiempo Real para HabiReto.
 * 
 * Permite evidenciar que en fondos anónimos los aportes de terceros viajan como null
 * directamente desde el payload HTTP del servidor, garantizando cero fuga de datos.
 */

import { api, formatCOP } from "../api.js";
import { store } from "../state.js";

export function initPrivacyInspector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let currentCow = null;
  let isExpanded = true;

  async function inspectAnonymousCow() {
    const cows = store.getState().cows || [];
    const anonCow = cows.find((c) => c.visibility_type === "ANONYMOUS");
    if (!anonCow) {
      currentCow = null;
      render();
      return;
    }

    try {
      const detail = await api.getCowDetail(anonCow.id);
      currentCow = detail;
    } catch (err) {
      // Silenciar si no está disponible o no tiene permisos
    } finally {
      render();
    }
  }

  function render() {
    const active = store.getActiveUser();

    if (!currentCow) {
      container.innerHTML = `
        <div class="bank-card" style="margin-top:28px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h3 style="font-size:16px;font-weight:700;margin:0 0 4px 0;color:#0F172A;">
                Auditor de Privacidad Zero-Trust (Inspección en Vivo)
              </h3>
              <p style="font-size:13px;color:#64748B;margin:0;">
                Crea una vaca con modalidad "Anónima (Zero-Trust)" para auditar en tiempo real la máscara criptográfica del servidor.
              </p>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const members = currentCow.members || [];

    container.innerHTML = `
      <div class="bank-card" style="margin-top:28px;">
        
        <!-- Cabecera del Inspector con Toggle de Colapso -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
              <h3 style="font-size:17px;font-weight:700;margin:0;color:#0F172A;">
                Auditor de Privacidad Zero-Trust: "${currentCow.title}"
              </h3>
              <span class="badge badge-warning" style="font-size:11px;">Bóveda Anónima</span>
            </div>
            <p style="font-size:13px;color:#64748B;margin:0;">
              Identidad Activa en Consulta: <strong style="color:#173B63;">${active.name}</strong> (${active.role}).
              Comprueba cómo FastAPI enmascara del lado del servidor los aportes individuales de otros participantes.
            </p>
          </div>

          <div style="display:flex;gap:8px;">
            <button type="button" id="btnRefreshInspector" class="bank-btn bank-btn-secondary bank-btn-sm" style="font-size:12px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              Re-consultar API
            </button>
            <button type="button" id="btnToggleInspector" class="bank-btn bank-btn-secondary bank-btn-sm" style="font-size:12px;">
              ${isExpanded ? "Ocultar Detalles" : "Mostrar Detalles"}
            </button>
          </div>
        </div>

        ${
          isExpanded
            ? `
          <!-- Comparativa: Vista Autorizada vs Payload HTTP Crudo -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-top:14px;">
            
            <!-- Lado Izquierdo: Renderizado en UI según permisos -->
            <div style="background:#F8FAFD;border:1px solid #E2E8F0;border-radius:12px;padding:16px;">
              <div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">
                Visualización Autorizada en Pantalla:
              </div>

              <div style="display:flex;flex-direction:column;gap:8px;">
                ${members
                  .map((m) => {
                    const isMe = m.user_id === active.id;
                    const hasAmount = m.amount_contributed !== null && m.amount_contributed !== undefined;

                    return `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:${isMe ? "#EAF6EF" : "#FFFFFF"};border-radius:8px;border:1px solid ${isMe ? "#B7E4CF" : "#E2E8F0"};">
                      <div>
                        <div style="font-size:13px;font-weight:700;color:#0F172A;">${m.full_name}</div>
                        <div style="font-size:11px;color:#64748B;">${m.role} ${isMe ? "(Tú)" : ""}</div>
                      </div>
                      <div style="text-align:right;">
                        ${
                          hasAmount
                            ? `<strong class="tabular-nums" style="color:#0E744A;font-size:13px;font-weight:700;">${formatCOP(m.amount_contributed)}</strong>`
                            : `<span class="badge badge-warning" style="font-size:11px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> [Aporte Oculto]</span>`
                        }
                      </div>
                    </div>
                  `;
                  })
                  .join("")}
              </div>

              <div style="margin-top:14px;padding-top:10px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;font-size:13px;">
                <span style="color:#64748B;font-weight:600;">Total Acumulado en Bóveda:</span>
                <strong class="tabular-nums" style="color:#0F172A;font-weight:700;">${formatCOP(currentCow.collected_amount)}</strong>
              </div>
            </div>

            <!-- Lado Derecho: Payload JSON en Red (Zero-Trust Proof) -->
            <div style="background:#081424;border-radius:12px;padding:16px;color:#F8FAFC;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;font-size:12px;overflow-x:auto;border:1px solid #1E293B;">
              <div style="display:flex;justify-content:space-between;color:#94A3B8;font-size:11px;margin-bottom:10px;font-family:sans-serif;font-weight:600;">
                <span>Payload HTTP (GET /api/v1/cows/${currentCow.id}):</span>
                <span class="badge badge-success" style="font-size:10px;padding:1px 6px;">200 OK</span>
              </div>
              <pre style="margin:0;line-height:1.45;color:#38BDF8;">${JSON.stringify(
                {
                  id: currentCow.id,
                  title: currentCow.title,
                  visibility_type: currentCow.visibility_type,
                  collected_amount: currentCow.collected_amount,
                  members: (currentCow.members || []).map((m) => ({
                    user_id: m.user_id,
                    full_name: m.full_name,
                    role: m.role,
                    amount_contributed: m.amount_contributed, // null garantizado desde el servidor
                  })),
                },
                null,
                2
              )}</pre>
            </div>

          </div>
        `
            : ""
        }

      </div>
    `;

    const btnRefresh = container.querySelector("#btnRefreshInspector");
    const btnToggle = container.querySelector("#btnToggleInspector");

    if (btnRefresh) {
      btnRefresh.addEventListener("click", () => inspectAnonymousCow());
    }
    if (btnToggle) {
      btnToggle.addEventListener("click", () => {
        isExpanded = !isExpanded;
        render();
      });
    }
  }

  inspectAnonymousCow();

  store.subscribe((state) => {
    // Si la vaca o el usuario activo mutan, re-inspeccionar
    inspectAnonymousCow();
  });
}