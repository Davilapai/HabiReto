/**
 * Selector de identidad activa y registro dinámico de personas para HabiReto.
 * 
 * Gestiona la selección dinámica entre todas las personas registradas,
 * actualizando el contexto de autorización de red (X-User-Id) de forma centralizada,
 * y permite el registro en caliente (onboarding) de nuevos usuarios y cuentas.
 */

import { api } from "../api.js";
import { store } from "../state.js";
import { showToast } from "./toast.js";

export function initIdentitySelector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let isRegistering = false;

  function render(state) {
    const active = state.activeUser;
    const users = store.getUsers();

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        
        <!-- Tarjeta de Identidad Activa -->
        <div style="display:flex;align-items:center;gap:10px;padding:6px 12px;background:#FFFFFF;border:1px solid #E5EAF0;border-radius:8px;box-shadow:0 1px 2px rgba(16,24,40,0.04);">
          <div style="width:32px;height:32px;border-radius:50%;background:#173B63;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;letter-spacing:0.5px;">
            ${active.initials || "US"}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:13px;font-weight:600;color:#111827;">${active.name}</span>
              <span class="badge badge-navy" style="font-size:11px;padding:1px 6px;">${active.role || "Usuario"}</span>
            </div>
            <span style="font-size:11px;color:#667085;font-family:monospace;">${active.phone}</span>
          </div>
        </div>

        <!-- Selector de Identidades Registradas -->
        <div style="position:relative;">
          <select id="identityDropdown" class="bank-select" style="font-size:13px;padding:8px 12px;cursor:pointer;background-color:#FFFFFF;">
            ${users
              .map(
                (u) => `
                <option value="${u.key || u.id}" ${u.id === active.id ? "selected" : ""}>
                  ${u.name} — ${u.role || "Usuario"}
                </option>
              `
              )
              .join("")}
          </select>
        </div>

        <!-- Botón para Registrar Nueva Persona -->
        <button type="button" id="btnOpenRegisterUser" class="bank-btn bank-btn-secondary" style="font-size:12px;padding:7px 12px;display:flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
          </svg>
          <span>+ Registrar Persona</span>
        </button>

      </div>

      <!-- Contenedor del Modal de Registro de Usuario -->
      <div id="userModalRoot"></div>
    `;

    // Manejador del cambio de identidad
    const select = container.querySelector("#identityDropdown");
    select.addEventListener("change", (e) => {
      const selectedValue = e.target.value;
      const targetUser = users.find(
        (u) => u.key === selectedValue || u.id === selectedValue
      );
      if (targetUser && targetUser.id !== state.activeUser.id) {
        store.setActiveUser(selectedValue);
        showToast(`Identidad cambiada a ${targetUser.name}`, "info", 2500);
      }
    });

    // Manejador para abrir el modal de registro
    const btnOpenRegister = container.querySelector("#btnOpenRegisterUser");
    btnOpenRegister.addEventListener("click", () => {
      openRegisterModal();
    });
  }

  function openRegisterModal() {
    const modalRoot = container.querySelector("#userModalRoot");
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="bank-modal-overlay">
        <div class="bank-modal-content" style="max-width:440px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div>
              <h3 style="font-size:18px;font-weight:600;margin:0;color:#111827;">Registrar Nueva Persona</h3>
              <span style="font-size:12px;color:#667085;">Crea un usuario y su cuenta bancaria personal en HabiReto</span>
            </div>
            <button type="button" id="btnCloseRegisterModal" style="background:none;border:none;cursor:pointer;color:#98A2B3;padding:4px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

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
              <span style="font-size:11px;color:#667085;">Utilizado como alias de destino para transferencias P2P.</span>
            </div>

            <div>
              <label class="bank-label" for="regInitialBalance">Saldo inicial de apertura (COP):</label>
              <input type="number" id="regInitialBalance" class="bank-input" min="0" step="any" value="50000" placeholder="0">
              <span style="font-size:11px;color:#667085;">Monto en pesos con el que iniciará su cuenta bancaria.</span>
            </div>

            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
              <button type="button" id="btnCancelRegisterModal" class="bank-btn bank-btn-secondary">Cancelar</button>
              <button type="submit" id="btnSubmitRegisterUser" class="bank-btn bank-btn-primary" ${isRegistering ? "disabled" : ""}>
                ${isRegistering ? "Registrando..." : "Crear Persona"}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeBtn = modalRoot.querySelector("#btnCloseRegisterModal");
    const cancelBtn = modalRoot.querySelector("#btnCancelRegisterModal");
    const closeAction = () => {
      modalRoot.innerHTML = "";
    };
    closeBtn.addEventListener("click", closeAction);
    cancelBtn.addEventListener("click", closeAction);

    const form = modalRoot.querySelector("#registerUserForm");
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

        // Agrega el usuario al almacén y activa su sesión
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

  // Render inicial y suscripción a cambios de estado
  render(store.getState());
  store.subscribe(render);
}
