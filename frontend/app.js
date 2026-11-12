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
      if (currentViewTitle) currentViewTitle.textContent = "Inicio";
      if (dashboardSection) dashboardSection.style.display = "block";
      store.setActiveTab("dashboard");
      reloadDashboard();
    } else if (view === "cows") {
      setActiveSidebar(sideNavCows);
      if (currentViewTitle) currentViewTitle.textContent = "Vacas";
      if (cowsSection) cowsSection.style.display = "block";
      store.setActiveTab("cows");
      reloadCows();
    } else if (view === "history") {
      setActiveSidebar(sideNavHistory);
      if (currentViewTitle) currentViewTitle.textContent = "Movimientos";
      if (historySection) historySection.style.display = "block";
      store.setActiveTab("history");
      reloadHistory();
    } else if (view === "settings") {
      setActiveSidebar(sideNavSettings);
      if (currentViewTitle) currentViewTitle.textContent = "Configuración";
      if (settingsSection) {
        settingsSection.style.display = "block";
        renderSettingsView();
      }
    } else if (view === "help") {
      setActiveSidebar(sideNavHelp);
      if (currentViewTitle) currentViewTitle.textContent = "Ayuda";
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

  // Vista de Configuración: solo los datos de la identidad y la cuenta activas.
  function renderSettingsView() {
    const root = document.getElementById("settingsRoot");
    if (!root) return;
    const active = store.getActiveUser();

    root.innerHTML = `
      <div class="bank-card" style="max-width:640px;">
        <h2 class="card-title">Cuenta</h2>
        <dl class="def-list">
          <dt>Titular</dt><dd>${active.name}</dd>
          <dt>Celular</dt><dd class="tabular-nums">${active.phone}</dd>
          <dt>Cuenta</dt><dd class="tabular-nums">${active.accountNumber || "ACC-001"}</dd>
          <dt>Moneda</dt><dd>COP</dd>
          <dt>ID de cuenta</dt><dd class="tabular-nums" style="font-weight:400;font-size:12px;word-break:break-all;">${active.accountId}</dd>
        </dl>
      </div>
    `;
  }

  // Vista de Ayuda: preguntas frecuentes plegables (<details>) para no saturar la vista.
  function renderHelpView() {
    const root = document.getElementById("helpRoot");
    if (!root) return;

    const faqs = [
      [
        "¿Qué es una vaca anónima?",
        "Cada participante ve solo su propio aporte. El servidor oculta los aportes de los demás antes de responder.",
      ],
      [
        "¿Por qué cada movimiento muestra un saldo?",
        "Cada asiento guarda el saldo resultante en el momento de la operación, así el historial es verificable.",
      ],
      [
        "¿Cómo agrego personas?",
        "Usa el botón + en la cabecera. La nueva persona queda lista para transferir y unirse a vacas.",
      ],
    ];

    root.innerHTML = `
      <div class="stack-sm" style="max-width:720px;">
        ${faqs
          .map(
            ([q, a]) => `
            <details class="disclosure">
              <summary>${q}</summary>
              <div class="disclosure-body">${a}</div>
            </details>
          `
          )
          .join("")}
      </div>
    `;
  }

  // Cierre global de modales: Escape o clic en el fondo oscuro. Los modales se
  // montan como `.bank-modal-overlay`; retirarlos del DOM equivale a cerrarlos.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelector(".bank-modal-overlay")?.remove();
  });
  document.addEventListener("click", (e) => {
    if (e.target.classList?.contains("bank-modal-overlay")) e.target.remove();
  });
});
