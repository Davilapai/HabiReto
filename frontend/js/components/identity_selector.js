/**
 * Selector de identidad activa para la demostración de HabiReto.
 * 
 * Gestiona la selección entre Alice (Titular), Bob (Roommate) y Charlie (Amigo),
 * actualizando el contexto de autorización de red (X-User-Id) de forma centralizada.
 */

import { DEMO_USERS, store } from "../state.js";
import { showToast } from "./toast.js";

export function initIdentitySelector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  function render(state) {
    const active = state.activeUser;

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="display:flex;align-items:center;gap:10px;padding:6px 12px;background:#FFFFFF;border:1px solid #E5EAF0;border-radius:8px;box-shadow:0 1px 2px rgba(16,24,40,0.04);">
          <div style="width:32px;height:32px;border-radius:50%;background:#173B63;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;letter-spacing:0.5px;">
            ${active.initials}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:13px;font-weight:600;color:#111827;">${active.name}</span>
              <span class="badge badge-navy" style="font-size:11px;padding:1px 6px;">${active.role}</span>
            </div>
            <span style="font-size:11px;color:#667085;font-family:monospace;">${active.phone}</span>
          </div>
        </div>

        <div style="position:relative;">
          <select id="identityDropdown" class="bank-select" style="font-size:13px;padding:8px 12px;cursor:pointer;background-color:#FFFFFF;">
            <option value="alice" ${active.key === "alice" ? "selected" : ""}>Alice — Titular</option>
            <option value="bob" ${active.key === "bob" ? "selected" : ""}>Bob — Roommate</option>
            <option value="charlie" ${active.key === "charlie" ? "selected" : ""}>Charlie — Amigo</option>
          </select>
        </div>
      </div>
    `;

    const select = container.querySelector("#identityDropdown");
    select.addEventListener("change", (e) => {
      const selectedKey = e.target.value;
      const targetUser = DEMO_USERS[selectedKey];
      if (targetUser && targetUser.id !== state.activeUser.id) {
        store.setActiveUser(selectedKey);
        showToast(`Identidad cambiada a ${targetUser.name}`, "info", 2500);
      }
    });
  }

  // Render inicial y suscripción a cambios de estado
  render(store.getState());
  store.subscribe(render);
}
