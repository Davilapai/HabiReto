/**
 * Selector de identidad activa y gestión unificada de personas para HabiReto.
 * 
 * Implementa el control de identidades en la barra superior:
 * - Botón con avatar y nombre del usuario activo que abre el cambio de cuenta.
 * - Botón de icono "+" como acceso directo al registro de personas.
 * - Modal unificado con conmutación en un solo clic y formulario de alta de cuentas.
 */

import { api } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

export function initIdentitySelector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let isRegistering = false;
  let activeModalTab = "switch"; // 'switch' | 'register'

  function render(state) {
    const active = state.activeUser;
    const firstName =
      active.shortName ||
      (active.name ? active.name.trim().split(/\s+/)[0] : "Usuario");

    // Cabecera mínima: un único botón con avatar y nombre abre el gestor de
    // identidades; el icono "+" lleva directo al registro.
    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <button type="button" id="btnQuickRegister" class="bank-btn bank-btn-secondary bank-btn-sm" aria-label="Registrar persona" title="Registrar persona" style="padding:7px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>

        <button type="button" id="btnSwitchPersona" class="identity-chip" aria-haspopup="dialog" title="Cambiar de cuenta">
          <span class="avatar avatar-active" style="width:28px;height:28px;font-size:11px;">${active.initials || "US"}</span>
          <span>${firstName}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>

      <div id="manageUsersModalRoot"></div>
    `;

    const btnRegister = container.querySelector("#btnQuickRegister");
    const btnSwitch = container.querySelector("#btnSwitchPersona");

    if (btnRegister) {
      btnRegister.addEventListener("click", () => openManageUsersModal("register"));
    }
    if (btnSwitch) {
      btnSwitch.addEventListener("click", () => openManageUsersModal("switch"));
    }
  }

  function openManageUsersModal(defaultTab = "switch") {
    const modalRoot = container.querySelector("#manageUsersModalRoot");
    if (!modalRoot) return;

    activeModalTab = defaultTab;

    function renderModalContent() {
      const active = store.getActiveUser();
      const users = store.getUsers();

      modalRoot.innerHTML = `
        <div class="bank-modal-overlay">
          <div class="bank-modal-content" role="dialog" aria-modal="true" aria-labelledby="manageUsersTitle" style="max-width:460px;">

            <div class="modal-head">
              <h3 id="manageUsersTitle" class="modal-title">${activeModalTab === "switch" ? "Cambiar de cuenta" : "Registrar persona"}</h3>
              <button type="button" id="btnCloseManageModal" class="btn-icon" aria-label="Cerrar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            ${
              activeModalTab === "switch"
                ? `
                <div class="row-list" style="max-height:320px;overflow-y:auto;">
                  ${users
                    .map((u) => {
                      const isActive = u.id === active.id;
                      return `
                      <button type="button" class="row-item user-select-row ${isActive ? "is-active" : ""}" data-user-key="${u.key || u.id}" ${isActive ? 'aria-current="true"' : ""}>
                        <span style="display:flex;align-items:center;gap:12px;">
                          <span class="avatar ${isActive ? "avatar-active" : ""}">${u.initials || "US"}</span>
                          <span>
                            <span style="display:block;font-weight:600;color:#0F172A;">${u.name}</span>
                            <span class="muted tabular-nums" style="font-size:12px;">${u.phone}</span>
                          </span>
                        </span>
                        ${isActive ? `<span class="muted" style="font-size:12px;">Actual</span>` : ""}
                      </button>
                    `;
                    })
                    .join("")}
                </div>

                <div style="margin-top:20px;">
                  <button type="button" id="btnGoRegisterTab" class="btn-link">+ Registrar persona</button>
                </div>
              `
                : `
                <form id="registerUserForm" class="stack-md">
                  <div>
                    <label class="bank-label" for="regFullName">Nombre completo</label>
                    <input type="text" id="regFullName" class="bank-input" required placeholder="Ej. Diana Morales" maxlength="255">
                  </div>

                  <div>
                    <label class="bank-label" for="regEmail">Correo</label>
                    <input type="email" id="regEmail" class="bank-input" required placeholder="diana@habireto.com" maxlength="255">
                  </div>

                  <div>
                    <label class="bank-label" for="regPhone">Celular</label>
                    <input type="tel" id="regPhone" class="bank-input" required placeholder="+573004445555" maxlength="50">
                  </div>

                  <div>
                    <label class="bank-label" for="regInitialBalance">Saldo inicial (COP)</label>
                    <input type="number" id="regInitialBalance" class="bank-input tabular-nums" min="0" step="any" value="50000" placeholder="0">
                  </div>

                  <div class="modal-actions" style="margin-top:8px;">
                    <button type="button" id="btnBackToSwitch" class="bank-btn bank-btn-secondary">Volver</button>
                    <button type="submit" id="btnSubmitRegisterUser" class="bank-btn bank-btn-primary" ${isRegistering ? "disabled" : ""}>
                      ${isRegistering ? `<span class="bank-spinner"></span> Registrando…` : "Registrar"}
                    </button>
                  </div>
                </form>
              `
            }

          </div>
        </div>
      `;

      // Cierre del modal
      const closeBtn = modalRoot.querySelector("#btnCloseManageModal");
      const closeAction = () => {
        modalRoot.innerHTML = "";
      };
      if (closeBtn) closeBtn.addEventListener("click", closeAction);

      // Navegación entre listado y registro
      const btnGoRegister = modalRoot.querySelector("#btnGoRegisterTab");
      const btnBackSwitch = modalRoot.querySelector("#btnBackToSwitch");

      if (btnGoRegister) {
        btnGoRegister.addEventListener("click", () => {
          activeModalTab = "register";
          renderModalContent();
        });
      }
      if (btnBackSwitch) {
        btnBackSwitch.addEventListener("click", () => {
          activeModalTab = "switch";
          renderModalContent();
        });
      }

      // Eventos para conmutar de usuario con 1 clic
      if (activeModalTab === "switch") {
        modalRoot.querySelectorAll(".user-select-row").forEach((row) => {
          row.addEventListener("click", () => {
            const userKey = row.getAttribute("data-user-key");
            const targetUser = users.find(
              (u) => u.key === userKey || u.id === userKey
            );
            if (targetUser && targetUser.id !== active.id) {
              store.setActiveUser(userKey);
              showToast(`Identidad cambiada a ${targetUser.name}`, "info", 2500);
              closeAction();
            }
          });
        });
      }

      // Manejador del formulario de registro
      if (activeModalTab === "register") {
        const form = modalRoot.querySelector("#registerUserForm");
        if (form) {
          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (isRegistering) return;

            const fullName = modalRoot.querySelector("#regFullName").value.trim();
            const email = modalRoot.querySelector("#regEmail").value.trim();
            const phone = modalRoot.querySelector("#regPhone").value.trim();
            const rawBalance = modalRoot.querySelector("#regInitialBalance").value;
            const initialBalance = Math.max(0, Math.floor(Number(rawBalance) || 0));

            if (!fullName || !email || !phone) {
              showToast("Por favor completa los campos obligatorios.", "error");
              return;
            }

            isRegistering = true;
            const submitBtn = modalRoot.querySelector("#btnSubmitRegisterUser");
            if (submitBtn) submitBtn.disabled = true;

            try {
              const newUser = await api.createUser({
                full_name: fullName,
                email,
                phone_number: phone,
                initial_balance: initialBalance,
              });

              store.addUser(newUser);
              showToast(`Persona ${fullName} registrada exitosamente`, "success");
              closeAction();
            } catch (err) {
              showToast(err.message || "Error al registrar persona.", "error");
            } finally {
              isRegistering = false;
            }
          });
        }
      }
    }

    renderModalContent();
  }

  render(store.getState());
  store.subscribe(render);
}