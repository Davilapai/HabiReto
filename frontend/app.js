/**
 * Punto de entrada principal (SPA Bootstrapper) para HabiReto Frontend.
 * 
 * Coordina la inicialización de los módulos de identidad, dashboard de transferencias,
 * fondos colaborativos ("Vacas") e inspector de privacidad Zero-Trust.
 */

import { api } from "./js/api.js";
import { initDashboard, reloadDashboard } from "./js/components/dashboard.js";
import { initIdentitySelector } from "./js/components/identity_selector.js";
import { initCows, reloadCows } from "./js/components/cows.js";
import { initPrivacyInspector } from "./js/components/privacy_inspector.js";
import { store } from "./js/state.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Inicializar selector de identidades (Alice, Bob, Charlie y dinámicos)
  initIdentitySelector("identitySelectorRoot");

  // 2. Inicializar Dashboard de cuentas, recargas y transferencias
  initDashboard("dashboardRoot");

  // 3. Inicializar Módulo de Vacas colaborativas
  initCows("cowsRoot");

  // 4. Inicializar Inspector de Privacidad en tiempo real
  initPrivacyInspector("privacyInspectorRoot");

  // 5. Carga inicial de usuarios registrados desde el backend
  api.listUsers()
    .then((users) => {
      if (users && users.length > 0) {
        store.setUsers(users);
      }
    })
    .catch((err) => {
      console.warn("No fue posible sincronizar usuarios remotos en el arranque:", err.message);
    });

  // 5. Configuración de navegación por pestañas (Tabs)
  const tabDashboard = document.getElementById("tabDashboard");
  const tabCows = document.getElementById("tabCows");
  const dashboardSection = document.getElementById("dashboardSection");
  const cowsSection = document.getElementById("cowsSection");

  function switchTab(target) {
    if (target === "dashboard") {
      tabDashboard.style.borderBottomColor = "#173B63";
      tabDashboard.style.color = "#173B63";
      tabDashboard.style.fontWeight = "600";
      tabDashboard.setAttribute("aria-selected", "true");

      tabCows.style.borderBottomColor = "transparent";
      tabCows.style.color = "#667085";
      tabCows.style.fontWeight = "500";
      tabCows.setAttribute("aria-selected", "false");

      dashboardSection.style.display = "block";
      cowsSection.style.display = "none";
      store.setActiveTab("dashboard");
      reloadDashboard();
    } else if (target === "cows") {
      tabCows.style.borderBottomColor = "#173B63";
      tabCows.style.color = "#173B63";
      tabCows.style.fontWeight = "600";
      tabCows.setAttribute("aria-selected", "true");

      tabDashboard.style.borderBottomColor = "transparent";
      tabDashboard.style.color = "#667085";
      tabDashboard.style.fontWeight = "500";
      tabDashboard.setAttribute("aria-selected", "false");

      cowsSection.style.display = "block";
      dashboardSection.style.display = "none";
      store.setActiveTab("cows");
      reloadCows();
    }
  }

  if (tabDashboard && tabCows) {
    tabDashboard.addEventListener("click", () => switchTab("dashboard"));
    tabCows.addEventListener("click", () => switchTab("cows"));
  }
});
