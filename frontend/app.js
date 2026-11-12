/**
 * Punto de entrada principal (SPA Bootstrapper) para HabiReto Frontend.
 * 
 * Coordina la inicialización de los módulos de identidad, navegación lateral,
 * panel central financiero, fondos colaborativos ("Vacas"), módulo de extractos
 * del Libro Mayor e inspector de privacidad Zero-Trust.
 */

import { api } from "./js/api.js";
import { initDashboard, reloadDashboard } from "./js/components/dashboard.js";
import { initIdentitySelector } from "./js/components/identity_selector.js";
import { initCows, reloadCows } from "./js/components/cows.js";
import { initPrivacyInspector } from "./js/components/privacy_inspector.js";
import { initHistory, reloadHistory } from "./js/components/history.js";
import { store } from "./js/state.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Inicializar selector de identidades (Alice, Bob, Charlie y dinámicos)
  initIdentitySelector("identitySelectorRoot");

  // 2. Inicializar Dashboard enfocado (Panel Central: Saldo + Recarga + Transferencia)
  initDashboard("dashboardRoot");

  // 3. Inicializar Módulo de Vacas colaborativas
  initCows("cowsRoot");

  // 4. Inicializar Inspector de Privacidad en tiempo real
  initPrivacyInspector("privacyInspectorRoot");

  // 5. Inicializar Módulo Dedicado de Movimientos / Libro Mayor
  initHistory("historyRoot");

  // 6. Carga inicial de usuarios registrados desde el backend
  api.listUsers()
    .then((users) => {
      if (users && users.length > 0) {
        store.setUsers(users);
      }
    })
    .catch((err) => {
      console.warn("No fue posible sincronizar usuarios remotos en el arranque:", err.message);
    });

  // 7. Enlace y Coordinación de Navegación Exclusiva por Sidebar
  const sideNavInicio = document.getElementById("sideNavInicio");
  const sideNavCows = document.getElementById("sideNavCows");
  const sideNavHistory = document.getElementById("sideNavHistory");
  const sideNavSettings = document.getElementById("sideNavSettings");
  const sideNavHelp = document.getElementById("sideNavHelp");

  const dashboardSection = document.getElementById("dashboardSection");
  const cowsSection = document.getElementById("cowsSection");
  const historySection = document.getElementById("historySection");
  const settingsSection = document.getElementById("settingsSection");
  const helpSection = document.getElementById("helpSection");
  const currentViewTitle = document.getElementById("currentViewTitle");

  const sidebarItems = [
    sideNavInicio,
    sideNavCows,
    sideNavHistory,
    sideNavSettings,
    sideNavHelp,
  ];

  function setActiveSidebar(activeItem) {
    sidebarItems.forEach((btn) => {
      if (btn) btn.classList.remove("active");
    });
    if (activeItem) activeItem.classList.add("active");
  }

  function hideAllSections() {
    if (dashboardSection) dashboardSection.style.display = "none";
    if (cowsSection) cowsSection.style.display = "none";
    if (historySection) historySection.style.display = "none";
    if (settingsSection) settingsSection.style.display = "none";
    if (helpSection) helpSection.style.display = "none";
  }

  function navigateTo(view) {
    hideAllSections();

    if (view === "dashboard") {
      setActiveSidebar(sideNavInicio);
      if (currentViewTitle) currentViewTitle.textContent = "Panel Principal";
      if (dashboardSection) dashboardSection.style.display = "block";
      store.setActiveTab("dashboard");
      reloadDashboard();
    } else if (view === "cows") {
      setActiveSidebar(sideNavCows);
      if (currentViewTitle) currentViewTitle.textContent = "Fondos Colaborativos (Vacas)";
      if (cowsSection) cowsSection.style.display = "block";
      store.setActiveTab("cows");
      reloadCows();
    } else if (view === "history") {
      setActiveSidebar(sideNavHistory);
      if (currentViewTitle) currentViewTitle.textContent = "Extracto de Movimientos (Libro Mayor)";
      if (historySection) historySection.style.display = "block";
      store.setActiveTab("history");
      reloadHistory();
    } else if (view === "settings") {
      setActiveSidebar(sideNavSettings);
      if (currentViewTitle) currentViewTitle.textContent = "Configuración del Sistema";
      if (settingsSection) {
        settingsSection.style.display = "block";
        renderSettingsView();
      }
    } else if (view === "help") {
      setActiveSidebar(sideNavHelp);
      if (currentViewTitle) currentViewTitle.textContent = "Centro de Ayuda y Arquitectura";
      if (helpSection) {
        helpSection.style.display = "block";
        renderHelpView();
      }
    }
  }

  // Event Listeners para Enlaces del Sidebar
  if (sideNavInicio) sideNavInicio.addEventListener("click", () => navigateTo("dashboard"));
  if (sideNavCows) sideNavCows.addEventListener("click", () => navigateTo("cows"));
  if (sideNavHistory) sideNavHistory.addEventListener("click", () => navigateTo("history"));
  if (sideNavSettings) sideNavSettings.addEventListener("click", () => navigateTo("settings"));
  if (sideNavHelp) sideNavHelp.addEventListener("click", () => navigateTo("help"));

  // Vista de Configuración del Sistema
  function renderSettingsView() {
    const root = document.getElementById("settingsRoot");
    if (!root) return;
    const active = store.getActiveUser();

    root.innerHTML = `
      <div class="bank-card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:40px;height:40px;border-radius:10px;background:#EAF2FA;color:#173B63;display:flex;align-items:center;justify-content:center;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <div>
            <h2 style="font-size:20px;font-weight:700;margin:0;color:#0F172A;">Configuración y Seguridad</h2>
            <span style="font-size:13px;color:#64748B;">Parámetros del motor financiero y la identidad activa</span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:20px;margin-top:20px;">
          <div style="padding:18px;background:#F8FAFD;border:1px solid #E2E8F0;border-radius:12px;">
            <span style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Identidad Activa</span>
            <div style="font-size:16px;font-weight:700;color:#0F172A;margin-top:6px;">${active.name}</div>
            <div style="font-size:13px;color:#64748B;margin-top:2px;">${active.phone} — Rol: ${active.role}</div>
            <div style="font-size:12px;font-family:monospace;color:#173B63;margin-top:6px;background:#EAF2FA;padding:3px 8px;border-radius:4px;display:inline-block;">ID: ${active.id}</div>
          </div>

          <div style="padding:18px;background:#F8FAFD;border:1px solid #E2E8F0;border-radius:12px;">
            <span style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Cuenta Bancaria Principal</span>
            <div style="font-size:16px;font-weight:700;color:#0F172A;margin-top:6px;">${active.accountNumber || "ACC-001"}</div>
            <div style="font-size:13px;color:#64748B;margin-top:2px;">Moneda: COP ($) — Escala Exacta de Centavos</div>
            <div style="font-size:12px;font-family:monospace;color:#173B63;margin-top:6px;background:#EAF2FA;padding:3px 8px;border-radius:4px;display:inline-block;">Account ID: ${active.accountId}</div>
          </div>

          <div style="padding:18px;background:#F8FAFD;border:1px solid #E2E8F0;border-radius:12px;">
            <span style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Invariantes del Ledger</span>
            <div style="font-size:14px;font-weight:700;color:#0E744A;margin-top:6px;">PostgreSQL Check Constraints</div>
            <div style="font-size:13px;color:#64748B;margin-top:4px;line-height:1.4;"><code>CHECK (balance >= 0)</code> evita físicamente sobregiros contables. Bloqueos pesimistas ordenados contra deadlocks.</div>
          </div>
        </div>
      </div>
    `;
  }

  // Vista de Ayuda y Guía del Reto
  function renderHelpView() {
    const root = document.getElementById("helpRoot");
    if (!root) return;

    root.innerHTML = `
      <div class="bank-card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:40px;height:40px;border-radius:10px;background:#EAF2FA;color:#173B63;display:flex;align-items:center;justify-content:center;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div>
            <h2 style="font-size:20px;font-weight:700;margin:0;color:#0F172A;">Centro de Ayuda y Arquitectura Técnica</h2>
            <span style="font-size:13px;color:#64748B;">Guía de operación de la banca digital y fondos colaborativos</span>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px;margin-top:20px;font-size:14px;color:#334155;line-height:1.6;">
          <div style="padding:18px;background:#F8FAFD;border:1px solid #E2E8F0;border-radius:12px;">
            <h3 style="font-size:15px;font-weight:700;color:#0F172A;margin:0 0 6px 0;">1. ¿Cómo funcionan las Vacas y la privacidad Zero-Trust?</h3>
            <p style="margin:0;">
              Al crear una Vaca, puedes definir si es pública o anónima. En una vaca anónima, cada aportante ve su propio aporte, pero los aportes de los demás se devuelven como <code>null</code> directamente desde el servidor backend de FastAPI antes de llegar al navegador.
            </p>
          </div>

          <div style="padding:18px;background:#F8FAFD;border:1px solid #E2E8F0;border-radius:12px;">
            <h3 style="font-size:15px;font-weight:700;color:#0F172A;margin:0 0 6px 0;">2. ¿Por qué el saldo posterior (balance_after) es inmutable?</h3>
            <p style="margin:0;">
              Cada movimiento contable (recarga, transferencia o aporte a una vaca) genera un asiento en el libro mayor de partida doble dentro de una transacción ACID en PostgreSQL. Nunca se recalculan saldos al vuelo para auditorías, sino que cada fila física registra el saldo exacto resultante.
            </p>
          </div>

          <div style="padding:18px;background:#F8FAFD;border:1px solid #E2E8F0;border-radius:12px;">
            <h3 style="font-size:15px;font-weight:700;color:#0F172A;margin:0 0 6px 0;">3. Registro dinámico de personas</h3>
            <p style="margin:0;">
              En cualquier momento puedes pulsar el botón <strong>"Registrar Persona"</strong> en la cabecera superior para crear nuevos usuarios con su cuenta bancaria lista para transferir y unirse a vacas de forma inmediata.
            </p>
          </div>
        </div>
      </div>
    `;
  }
});