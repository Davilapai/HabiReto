/**
 * Punto de entrada principal (SPA Bootstrapper) para HabiReto Frontend.
 * 
 * Coordina la inicialización de los módulos de identidad, sidebar de navegación,
 * panel central minimalista, fondos colaborativos ("Vacas"), módulo de extractos
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

  // 7. Enlace y Coordinación de Navegación (Sidebar + Tabs Superiores)
  const tabDashboard = document.getElementById("tabDashboard");
  const tabCows = document.getElementById("tabCows");
  const tabHistory = document.getElementById("tabHistory");

  const sideNavInicio = document.getElementById("sideNavInicio");
  const sideNavTransfer = document.getElementById("sideNavTransfer");
  const sideNavCows = document.getElementById("sideNavCows");
  const sideNavHistory = document.getElementById("sideNavHistory");
  const sideNavSettings = document.getElementById("sideNavSettings");
  const sideNavHelp = document.getElementById("sideNavHelp");

  const dashboardSection = document.getElementById("dashboardSection");
  const cowsSection = document.getElementById("cowsSection");
  const historySection = document.getElementById("historySection");
  const settingsSection = document.getElementById("settingsSection");
  const helpSection = document.getElementById("helpSection");

  const sidebarItems = [
    sideNavInicio,
    sideNavTransfer,
    sideNavCows,
    sideNavHistory,
    sideNavSettings,
    sideNavHelp,
  ];

  const topTabs = [tabDashboard, tabCows, tabHistory];

  function setActiveSidebar(activeItem) {
    sidebarItems.forEach((btn) => {
      if (btn) btn.classList.remove("active");
    });
    if (activeItem) activeItem.classList.add("active");
  }

  function setActiveTopTab(activeTab) {
    topTabs.forEach((tab) => {
      if (!tab) return;
      tab.style.borderBottomColor = "transparent";
      tab.style.color = "#667085";
      tab.style.fontWeight = "500";
      tab.setAttribute("aria-selected", "false");
    });

    if (activeTab) {
      activeTab.style.borderBottomColor = "#173B63";
      activeTab.style.color = "#173B63";
      activeTab.style.fontWeight = "600";
      activeTab.setAttribute("aria-selected", "true");
    }
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

    if (view === "dashboard" || view === "transfer") {
      setActiveTopTab(tabDashboard);
      setActiveSidebar(view === "transfer" ? sideNavTransfer : sideNavInicio);
      if (dashboardSection) dashboardSection.style.display = "block";
      store.setActiveTab("dashboard");
      reloadDashboard();

      if (view === "transfer") {
        setTimeout(() => {
          const recipientSelect = document.getElementById("transferRecipient");
          if (recipientSelect) {
            recipientSelect.focus();
            recipientSelect.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 100);
      }
    } else if (view === "cows") {
      setActiveTopTab(tabCows);
      setActiveSidebar(sideNavCows);
      if (cowsSection) cowsSection.style.display = "block";
      store.setActiveTab("cows");
      reloadCows();
    } else if (view === "history") {
      setActiveTopTab(tabHistory);
      setActiveSidebar(sideNavHistory);
      if (historySection) historySection.style.display = "block";
      store.setActiveTab("history");
      reloadHistory();
    } else if (view === "settings") {
      setActiveTopTab(null);
      setActiveSidebar(sideNavSettings);
      if (settingsSection) {
        settingsSection.style.display = "block";
        renderSettingsView();
      }
    } else if (view === "help") {
      setActiveTopTab(null);
      setActiveSidebar(sideNavHelp);
      if (helpSection) {
        helpSection.style.display = "block";
        renderHelpView();
      }
    }
  }

  // Event Listeners para Pestañas Superiores
  if (tabDashboard) tabDashboard.addEventListener("click", () => navigateTo("dashboard"));
  if (tabCows) tabCows.addEventListener("click", () => navigateTo("cows"));
  if (tabHistory) tabHistory.addEventListener("click", () => navigateTo("history"));

  // Event Listeners para Enlaces del Sidebar
  if (sideNavInicio) sideNavInicio.addEventListener("click", () => navigateTo("dashboard"));
  if (sideNavTransfer) sideNavTransfer.addEventListener("click", () => navigateTo("transfer"));
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
      <div class="bank-card" style="padding:28px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <div style="width:36px;height:36px;border-radius:8px;background:#EAF2FA;color:#173B63;display:flex;align-items:center;justify-content:center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <div>
            <h2 style="font-size:20px;font-weight:700;margin:0;color:#111827;">Configuración y Seguridad</h2>
            <span style="font-size:13px;color:#64748B;">Parámetros del motor financiero y la identidad activa</span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:20px;margin-top:20px;">
          <div style="padding:16px;background:#F8FAFD;border:1px solid #E5EAF0;border-radius:10px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;">Identidad Activa</span>
            <div style="font-size:16px;font-weight:700;color:#111827;margin-top:6px;">${active.name}</div>
            <div style="font-size:13px;color:#64748B;">${active.phone} — Rol: ${active.role}</div>
            <div style="font-size:12px;font-family:monospace;color:#173B63;margin-top:4px;">ID: ${active.id}</div>
          </div>

          <div style="padding:16px;background:#F8FAFD;border:1px solid #E5EAF0;border-radius:10px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;">Cuenta Bancaria Principal</span>
            <div style="font-size:16px;font-weight:700;color:#111827;margin-top:6px;">${active.accountNumber || "ACC-001"}</div>
            <div style="font-size:13px;color:#64748B;">Moneda: COP ($) — Escala Exacta de Centavos</div>
            <div style="font-size:12px;font-family:monospace;color:#173B63;margin-top:4px;">Account ID: ${active.accountId}</div>
          </div>

          <div style="padding:16px;background:#F8FAFD;border:1px solid #E5EAF0;border-radius:10px;">
            <span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;">Invariantes del Ledger</span>
            <div style="font-size:14px;font-weight:600;color:#16865B;margin-top:6px;">PostgreSQL Check Constraints</div>
            <div style="font-size:12px;color:#64748B;margin-top:4px;">CHECK (balance >= 0) enforcing physically no overdrafts. Bloqueo FOR UPDATE ordenado.</div>
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
      <div class="bank-card" style="padding:28px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <div style="width:36px;height:36px;border-radius:8px;background:#EAF2FA;color:#173B63;display:flex;align-items:center;justify-content:center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div>
            <h2 style="font-size:20px;font-weight:700;margin:0;color:#111827;">Centro de Ayuda y Arquitectura Técnica</h2>
            <span style="font-size:13px;color:#64748B;">Guía de operación de la banca digital y fondos colaborativos</span>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px;margin-top:20px;font-size:14px;color:#374151;line-height:1.6;">
          <div style="padding:16px;background:#F8FAFD;border:1px solid #E5EAF0;border-radius:10px;">
            <h3 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 6px 0;">1. ¿Cómo funcionan las Vacas y la privacidad Zero-Trust?</h3>
            <p style="margin:0;">
              Al crear una Vaca, puedes invitar a participantes específicos. Cada participante que aporte fondos verá reflejada su contribución en el saldo acumulado. Los usuarios que no hayan sido invitados no verán la vaca en su lista, garantizando aislamiento estricto validado en backend con encabezados <code>X-User-Id</code>.
            </p>
          </div>

          <div style="padding:16px;background:#F8FAFD;border:1px solid #E5EAF0;border-radius:10px;">
            <h3 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 6px 0;">2. ¿Por qué el saldo posterior (balance_after) es inmutable?</h3>
            <p style="margin:0;">
              Cada movimiento contable (recarga, transferencia o aporte a una vaca) genera un asiento en el libro mayor de partida doble dentro de una transacción ACID en PostgreSQL. Nunca se calculan saldos "al vuelo", sino que cada fila registra el saldo exacto resultante.
            </p>
          </div>

          <div style="padding:16px;background:#F8FAFD;border:1px solid #E5EAF0;border-radius:10px;">
            <h3 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 6px 0;">3. Registro dinámico de personas</h3>
            <p style="margin:0;">
              En cualquier momento puedes pulsar el botón <strong>"Registrar Persona"</strong> en la esquina superior derecha para crear nuevos usuarios con su cuenta bancaria lista para transferir y unirse a vacas de forma inmediata.
            </p>
          </div>
        </div>
      </div>
    `;
  }
});
