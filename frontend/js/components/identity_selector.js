/**
 * Selector de identidad activa y gestión unificada de personas para HabiReto.
 * 
 * Implementa el control de identidades en la barra superior:
 * - Avatar del usuario activo con iniciales, saludo "Hola, {Nombre}", rol y cursor interactivo.
 * - Botón de acceso directo "+ Registrar Persona".
 * - Modal unificado con conmutación en un solo clic y formulario de alta de cuentas.
 */

import { api, formatCOP } from "../api.js";
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

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        
        <!-- Botón para Registrar Nueva Persona -->
        <button type="button" id="btnQuickRegister" class="bank-btn bank-btn-secondary bank-btn-sm" style="font-weight:600;gap:6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>Registrar Persona</span>
        </button>

        <!-- Tarjeta del Usuario Activo (Click para Cambiar de Cuenta) -->
        <div id="btnSwitchPersona" style="display:flex;align-items:center;gap:10px;padding:6px 14px;background:#173B63;color:#FFFFFF;border-radius:10px;cursor:pointer;user-select:none;box-shadow:0 1px 3px rgba(15,23,42,0.12);transition:all 140ms;" title="Haz clic para alternar entre cuentas de prueba">
          <div style="width:28px;height:28px;border-radius:50%;background:#FFFFFF;color:#173B63;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">
            ${active.initials || "US"}
          </div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#FFFFFF;line-height:1.2;">
              Hola, ${firstName}
            </div>
            <div style="font-size:11px;color:#8FAEC9;line-height:1;">
              ${active.role || "Usuario"}
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8FAEC9" stroke-width="2.5" style="margin-left:2px;"><polyline points="6 9 12 15 18 9"/></svg>
        </div>

      </div>

      <!-- Contenedor del Modal de Gestión de Usuarios -->
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
          <div class="bank-modal-content" style="max-width:500px;padding:24px;">
            
            <!-- Cabecera del Modal -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid #E2E8F0;">
              <div>
                <h3 style="font-size:18px;font-weight:700;margin:0;color:#0F172A;">Gestión de Identidades</h3>
                <span style="font-size:12px;color:#64748B;">Alterna entre identidades del Sandbox o crea una nueva persona</span>
              </div>
              <button type="button" id="btnCloseManageModal" style="background:none;border:none;cursor:pointer;color:#94A3B8;padding:4px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <!-- Pestañas internas del Modal -->
            <div style="display:flex;gap:8px;background:#EDF2F7;padding:4px;border-radius:10px;margin-bottom:18px;">
              <button type="button" id="tabSwitchUser" style="flex:1;background:${activeModalTab === 'switch' ? '#FFFFFF' : 'transparent'};border:none;border-radius:8px;color:${activeModalTab === 'switch' ? '#173B63' : '#64748B'};font-size:13px;font-weight:600;padding:8px 12px;cursor:pointer;box-shadow:${activeModalTab === 'switch' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'};">
                Cambiar de Cuenta (${users.length})
              </button>
              <button type="button" id="tabRegisterUser" style="flex:1;background:${activeModalTab === 'register' ? '#FFFFFF' : 'transparent'};border:none;border-radius:8px;color:${activeModalTab === 'register' ? '#173B63' : '#64748B'};font-size:13px;font-weight:600;padding:8px 12px;cursor:pointer;box-shadow:${activeModalTab === 'register' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'};">
                + Registrar Persona
              </button>
            </div>

            <!-- Contenido Pestaña 1: Cambiar de Usuario -->
            ${
              activeModalTab === "switch"
                ? `
                <div style="display:flex;flex-direction:column;gap:10px;max-height:300px;overflow-y:auto;padding-right:2px;">
                  ${users
                    .map((u) => {
                      const isActive = u.id === active.id;
                      return `
                      <div class="user-select-row" data-user-key="${u.key || u.id}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid ${isActive ? '#173B63' : '#E2E8F0'};border-radius:10px;background:${isActive ? '#F0F6FC' : '#FFFFFF'};cursor:${isActive ? 'default' : 'pointer'};transition:all 140ms;">
                        <div style="display:flex;align-items:center;gap:12px;">
                          <div style="width:34px;height:34px;border-radius:50%;background:${isActive ? '#173B63' : '#EDF2F7'};color:${isActive ? '#FFFFFF' : '#334155'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">
                            ${u.initials || "US"}
                          </div>
                          <div>
                            <div style="display:flex;align-items:center;gap:6px;">
                              <span style="font-size:14px;font-weight:700;color:#0F172A;">${u.name}</span>
                              <span class="badge badge-navy" style="font-size:11px;padding:2px 6px;">${u.role || "Usuario"}</span>
                            </div>
                            <span style="font-size:12px;color:#64748B;font-family:monospace;">${u.phone}</span>
                          </div>
                        </div>
                        <div>
                          ${
                            isActive
                              ? `<span class="badge badge-success" style="font-size:11px;">Sesión Activa</span>`
                              : `<button type="button" class="bank-btn bank-btn-secondary bank-btn-sm" style="pointer-events:none;">Seleccionar</button>`
                          }
                        </div>
                      </div>
                    `;
                    })
                    .join("")}
                </div>

                <div style="margin-top:18px;padding-top:14px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center;">
                  <button type="button" id="btnGoRegisterTab" style="background:none;border:none;color:#173B63;font-size:13px;font-weight:600;cursor:pointer;padding:0;text-decoration:underline;">
                    + Registrar nueva persona
                  </button>
                  <button type="button" id="btnCancelManageModal" class="bank-btn bank-btn-secondary bank-btn-sm">Cerrar</button>
                </div>
              `
                : `
                <!-- Contenido Pestaña 2: Registrar Nueva Persona -->
                <form id="registerUserForm" style="display:flex;flex-direction:column;gap:14px;">
                  <div>
                    <label class="bank-label" for="regFullName">Nombre completo: *</label>
                    <input type="text" id="regFullName" class="bank-input" required placeholder="Ej. Diana Morales" maxlength="255">
                  </div>

                  <div>
                    <label class="bank-label" for="regEmail">Correo electrónico: *</label>
                    <input type="email" id="regEmail" class="bank-input" required placeholder="diana@habireto.com" maxlength="255">
                  </div>

                  <div>
                    <label class="bank-label" for="regPhone">Teléfono celular (+57...): *</label>
                    <input type="tel" id="regPhone" class="bank-input" required placeholder="+573004445555" maxlength="50">
                    <span style="font-size:11px;color:#64748B;margin-top:3px;display:block;">Identificador utilizado para transferencias P2P.</span>
                  </div>

                  <div>
                    <label class="bank-label" for="regInitialBalance">Saldo inicial de apertura (COP):</label>
                    <input type="number" id="regInitialBalance" class="bank-input tabular-nums" min="0" step="any" value="50000" placeholder="0">
                  </div>

                  <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px;padding-top:12px;border-top:1px solid #E2E8F0;">
                    <button type="button" id="btnBackToSwitch" class="bank-btn bank-btn-secondary bank-btn-sm">Volver</button>
                    <button type="submit" id="btnSubmitRegisterUser" class="bank-btn bank-btn-primary bank-btn-sm" ${isRegistering ? "disabled" : ""}>
                      ${isRegistering ? `<span class="bank-spinner"></span> Registrando...` : `Crear Persona`}
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
      const cancelBtn = modalRoot.querySelector("#btnCancelManageModal");
      const closeAction = () => {
        modalRoot.innerHTML = "";
      };
      if (closeBtn) closeBtn.addEventListener("click", closeAction);
      if (cancelBtn) cancelBtn.addEventListener("click", closeAction);

      // Pestañas
      const tabSwitch = modalRoot.querySelector("#tabSwitchUser");
      const tabRegister = modalRoot.querySelector("#tabRegisterUser");
      const btnGoRegister = modalRoot.querySelector("#btnGoRegisterTab");
      const btnBackSwitch = modalRoot.querySelector("#btnBackToSwitch");

      if (tabSwitch) {
        tabSwitch.addEventListener("click", () => {
          activeModalTab = "switch";
          renderModalContent();
        });
      }
      if (tabRegister) {
        tabRegister.addEventListener("click", () => {
          activeModalTab = "register";
          renderModalContent();
        });
      }
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