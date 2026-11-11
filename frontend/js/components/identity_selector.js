/**
 * Selector de identidad activa y gestión unificada de personas para HabiReto.
 * 
 * Implementa el rediseño Modern Digital Banking del Navbar:
 * - Tarjeta del usuario activo en azul marino (#173B63) con saludo "Hola {Nombre}" (sin apellidos).
 * - Botón de gestión "Cambiar o Registrar Persona" con modal unificado para alternar
 *   cuentas con un solo clic o dar de alta nuevos usuarios y cuentas bancarias.
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
    // Extraer primer nombre de pila (sin apellidos)
    const firstName =
      active.shortName ||
      (active.name ? active.name.trim().split(/\s+/)[0] : "Usuario");

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        
        <!-- Botón para Gestionar Personas (Registrar o Cambiar) -->
        <button type="button" id="btnManageUsers" class="bank-btn bank-btn-secondary" style="font-size:13px;padding:7px 14px;display:flex;align-items:center;gap:8px;border-radius:8px;font-weight:500;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <line x1="19" y1="8" x2="19" y2="14"></line>
            <line x1="22" y1="11" x2="16" y2="11"></line>
          </svg>
          <span>Registrar Persona</span>
        </button>

        <!-- Tarjeta del Usuario Activo en Azul (Lado Derecho) -->
        <div style="display:flex;align-items:center;gap:10px;padding:6px 14px;background:#173B63;color:#FFFFFF;border-radius:8px;box-shadow:0 1px 3px rgba(16,24,40,0.12);">
          <div style="width:28px;height:28px;border-radius:50%;background:#FFFFFF;color:#173B63;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;letter-spacing:0.5px;">
            ${active.initials || "US"}
          </div>
          <span style="font-size:14px;font-weight:600;color:#FFFFFF;letter-spacing:-0.2px;">
            Hola ${firstName}
          </span>
        </div>

      </div>

      <!-- Contenedor del Modal de Gestión de Usuarios -->
      <div id="manageUsersModalRoot"></div>
    `;

    // Manejador para abrir el modal de gestión unificada
    const btnManage = container.querySelector("#btnManageUsers");
    if (btnManage) {
      btnManage.addEventListener("click", () => {
        openManageUsersModal();
      });
    }
  }

  function openManageUsersModal() {
    const modalRoot = container.querySelector("#manageUsersModalRoot");
    if (!modalRoot) return;

    activeModalTab = "switch";

    function renderModalContent() {
      const active = store.getActiveUser();
      const users = store.getUsers();

      modalRoot.innerHTML = `
        <div class="bank-modal-overlay">
          <div class="bank-modal-content" style="max-width:480px;padding:24px;">
            
            <!-- Cabecera del Modal -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
              <div>
                <h3 style="font-size:18px;font-weight:600;margin:0;color:#111827;">Gestión de Personas</h3>
                <span style="font-size:12px;color:#667085;">Cambia de cuenta para operar o registra una nueva identidad</span>
              </div>
              <button type="button" id="btnCloseManageModal" style="background:none;border:none;cursor:pointer;color:#98A2B3;padding:4px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <!-- Pestañas internas del Modal -->
            <div style="display:flex;gap:8px;border-bottom:1px solid #E5EAF0;margin-bottom:18px;">
              <button type="button" id="tabSwitchUser" style="background:none;border:none;border-bottom:2px solid ${activeModalTab === 'switch' ? '#173B63' : 'transparent'};color:${activeModalTab === 'switch' ? '#173B63' : '#667085'};font-size:13px;font-weight:${activeModalTab === 'switch' ? '600' : '500'};padding:8px 12px;cursor:pointer;">
                Cambiar de Usuario (${users.length})
              </button>
              <button type="button" id="tabRegisterUser" style="background:none;border:none;border-bottom:2px solid ${activeModalTab === 'register' ? '#173B63' : 'transparent'};color:${activeModalTab === 'register' ? '#173B63' : '#667085'};font-size:13px;font-weight:${activeModalTab === 'register' ? '600' : '500'};padding:8px 12px;cursor:pointer;">
                + Registrar Persona
              </button>
            </div>

            <!-- Contenido Pestaña 1: Cambiar de Usuario -->
            ${
              activeModalTab === "switch"
                ? `
                <div style="display:flex;flex-direction:column;gap:10px;max-height:280px;overflow-y:auto;padding-right:4px;">
                  ${users
                    .map((u) => {
                      const isActive = u.id === active.id;
                      return `
                      <div class="user-select-row" data-user-key="${u.key || u.id}" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid ${isActive ? '#173B63' : '#E5EAF0'};border-radius:8px;background:${isActive ? '#F5F7FA' : '#FFFFFF'};cursor:${isActive ? 'default' : 'pointer'};transition:all 150ms;">
                        <div style="display:flex;align-items:center;gap:10px;">
                          <div style="width:32px;height:32px;border-radius:50%;background:${isActive ? '#173B63' : '#E5EAF0'};color:${isActive ? '#FFFFFF' : '#111827'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">
                            ${u.initials || "US"}
                          </div>
                          <div>
                            <div style="display:flex;align-items:center;gap:6px;">
                              <span style="font-size:13px;font-weight:600;color:#111827;">${u.name}</span>
                              <span class="badge badge-navy" style="font-size:10px;padding:0 5px;">${u.role || "Usuario"}</span>
                            </div>
                            <span style="font-size:11px;color:#667085;font-family:monospace;">${u.phone}</span>
                          </div>
                        </div>
                        <div>
                          ${
                            isActive
                              ? `<span class="badge badge-success" style="font-size:11px;">Sesión Activa</span>`
                              : `<button type="button" class="bank-btn bank-btn-secondary" style="font-size:11px;padding:4px 10px;pointer-events:none;">Seleccionar</button>`
                          }
                        </div>
                      </div>
                    `;
                    })
                    .join("")}
                </div>

                <div style="margin-top:16px;padding-top:12px;border-top:1px solid #E5EAF0;display:flex;justify-content:space-between;align-items:center;">
                  <button type="button" id="btnGoRegisterTab" style="background:none;border:none;color:#173B63;font-size:12px;font-weight:600;cursor:pointer;padding:0;text-decoration:underline;">
                    + Registrar nueva persona
                  </button>
                  <button type="button" id="btnCancelManageModal" class="bank-btn bank-btn-secondary" style="font-size:12px;padding:6px 14px;">Cerrar</button>
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
                    <span style="font-size:11px;color:#667085;">Utilizado como alias para transferencias entre personas.</span>
                  </div>

                  <div>
                    <label class="bank-label" for="regInitialBalance">Saldo inicial de apertura (COP):</label>
                    <input type="number" id="regInitialBalance" class="bank-input" min="0" step="any" value="50000" placeholder="0">
                  </div>

                  <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px;">
                    <button type="button" id="btnBackToSwitch" class="bank-btn bank-btn-secondary" style="font-size:12px;padding:7px 14px;">Volver</button>
                    <button type="submit" id="btnSubmitRegisterUser" class="bank-btn bank-btn-primary" style="font-size:12px;padding:7px 16px;" ${isRegistering ? "disabled" : ""}>
                      ${isRegistering ? "Registrando..." : "Crear Persona"}
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
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.textContent = "Registrando...";
            }

            try {
              const newUser = await api.createUser({
                full_name: fullName,
                email,
                phone_number: phone,
                initial_balance: initialBalance,
              });

              // Agregar usuario al almacén y conmutar sesión a él
              store.addUser(newUser);
              showToast(`Persona ${fullName} registrada exitosamente`, "success");
              closeAction();
            } catch (err) {
              showToast(err.message || "Error al registrar persona.", "error");
            } finally {
              isRegistering = false;
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Crear Persona";
              }
            }
          });
        }
      }
    }

    renderModalContent();
  }

  // Render inicial y suscripción a cambios de estado
  render(store.getState());
  store.subscribe(render);
}
