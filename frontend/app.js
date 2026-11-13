/**
 * Punto de entrada principal (SPA Bootstrapper) para Vaqui (HabiReto Frontend).
 *
 * Coordina la inicialización de los módulos de identidad, navegación lateral Terra,
 * vista inicial de bienvenida/acceso (`bienvenida_esto_es_habireto_sobrio`), panel principal
 * (`dashboard`), fondos colaborativos (`cows`), extracto del Libro Mayor (`history`),
 * configuración y selector de cuenta (`settings`) y centro de ayuda (`help`).
 */

import { api } from "./js/api.js";
import { initDashboard, reloadDashboard } from "./js/components/dashboard.js";
import { initIdentitySelector } from "./js/components/identity_selector.js";
import { initCows, reloadCows } from "./js/components/cows.js";
import { initHistory, reloadHistory } from "./js/components/history.js";
import { showToast } from "./js/components/toast.js";
import { store } from "./js/state.js";

/**
 * Obtiene las iniciales de hasta 2 letras a partir del nombre completo de una persona.
 *
 * @param {string} fullName - Nombre completo del titular.
 * @returns {string} Iniciales en mayúsculas.
 */
function getInitials(fullName) {
  if (!fullName) return "VQ";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Calcula una previsualización determinística de la llave única `@ABC123` a partir del nombre.
 *
 * @param {string} name - Nombre ingresado en el formulario.
 * @param {number} userCount - Cantidad actual de usuarios registrados.
 * @returns {string} Llave sugerida en formato `@ABC123`.
 */
function previewUserKey(name, userCount) {
  const clean = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
  const prefix = (clean + "VAQ").substring(0, 3);
  const suffix = String(((userCount + 1) * 111) % 900 + 100).padStart(3, "0");
  return `@${prefix}${suffix}`;
}

document.addEventListener("DOMContentLoaded", () => {
  // 1. Inicializar controles de identidad en la barra superior
  initIdentitySelector("identitySelectorRoot");

  // 2. Inicializar Panel Principal (Saldo + Recargar + Transferir)
  initDashboard("dashboardRoot");

  // 3. Inicializar Módulo de Vaquitas colaborativas y asistente de 4 pasos
  initCows("cowsRoot");

  // 4. Inicializar Módulo de Movimientos / Libro Mayor de partida doble
  initHistory("historyRoot");

  // 6. Sincronizar directorio de usuarios registrados desde el backend
  api
    .listUsers()
    .then((users) => {
      if (users && users.length > 0) {
        store.setUsers(users);
      }
    })
    .catch((err) => {
      console.warn("No fue posible sincronizar usuarios remotos en el arranque:", err.message);
    });

  // 7. Referencias DOM para navegación y secciones
  const welcomeSection = document.getElementById("welcomeSection");
  const appShell = document.getElementById("appShell");

  const sideNavInicio = document.getElementById("sideNavInicio");
  const sideNavCows = document.getElementById("sideNavCows");
  const sideNavHistory = document.getElementById("sideNavHistory");
  const sideNavSettings = document.getElementById("sideNavSettings");
  const sideNavHelp = document.getElementById("sideNavHelp");
  const btnLogoutWelcome = document.getElementById("btnLogoutWelcome");

  const dashboardSection = document.getElementById("dashboardSection");
  const cowsSection = document.getElementById("cowsSection");
  const historySection = document.getElementById("historySection");
  const settingsSection = document.getElementById("settingsSection");
  const helpSection = document.getElementById("helpSection");

  const currentViewTitle = document.getElementById("currentViewTitle");
  const currentViewBadge = document.getElementById("currentViewBadge");

  const sidebarItems = [
    sideNavInicio,
    sideNavCows,
    sideNavHistory,
    sideNavSettings,
    sideNavHelp,
  ];

  // La vista inicial por defecto al abrir http://localhost:3000/ es la página principal "Esto es Vaqui."
  let currentView = "welcome";
  let welcomeTab = "signup"; // 'signup' (por defecto en la captura de Stitch) | 'login'

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

  function setHeaderTitleAndBadge(titleText, badgeText = null) {
    if (currentViewTitle) currentViewTitle.textContent = titleText;
    if (currentViewBadge) {
      if (badgeText) {
        currentViewBadge.textContent = badgeText;
        currentViewBadge.classList.remove("hidden");
      } else {
        currentViewBadge.textContent = "";
        currentViewBadge.classList.add("hidden");
      }
    }
  }

  /**
   * Cambia la vista activa dentro de la aplicación o abre la portada de bienvenida.
   *
   * @param {string} view - Identificador de vista ('welcome'|'dashboard'|'cows'|'history'|'settings'|'help').
   * @param {Object} [options={}] - Opciones adicionales de enfoque.
   */
  function navigateTo(view, options = {}) {
    if (view === "welcome") {
      currentView = "welcome";
      if (appShell) appShell.classList.add("hidden");
      if (welcomeSection) {
        welcomeSection.classList.remove("hidden");
        renderWelcomeView();
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (welcomeSection) welcomeSection.classList.add("hidden");
    if (appShell) appShell.classList.remove("hidden");
    hideAllSections();
    currentView = view;

    if (view === "dashboard") {
      setActiveSidebar(sideNavInicio);
      setHeaderTitleAndBadge("Panel Principal", null);
      if (dashboardSection) dashboardSection.style.display = "block";
      store.setActiveTab("dashboard");
      reloadDashboard();
    } else if (view === "cows") {
      setActiveSidebar(sideNavCows);
      setHeaderTitleAndBadge("Vaquitas", null);
      if (cowsSection) cowsSection.style.display = "block";
      store.setActiveTab("cows");
      reloadCows();
    } else if (view === "history") {
      setActiveSidebar(sideNavHistory);
      setHeaderTitleAndBadge("Movimientos", "Libro Mayor");
      if (historySection) historySection.style.display = "block";
      store.setActiveTab("history");
      reloadHistory();
    } else if (view === "settings") {
      setActiveSidebar(sideNavSettings);
      setHeaderTitleAndBadge("Configuración", "Panel de Administración");
      if (settingsSection) {
        settingsSection.style.display = "block";
        renderSettingsView(options.focus);
      }
    } else if (view === "help") {
      setActiveSidebar(sideNavHelp);
      setHeaderTitleAndBadge("Ayuda", "Centro de Soporte & Guía");
      if (helpSection) {
        helpSection.style.display = "block";
        renderHelpView();
      }
    }
  }

  // Enlaces del menú lateral izquierdo
  const brandHomeBtn = document.getElementById("brandHomeBtn");
  if (brandHomeBtn) brandHomeBtn.addEventListener("click", () => navigateTo("dashboard"));
  if (sideNavInicio) sideNavInicio.addEventListener("click", () => navigateTo("dashboard"));
  if (sideNavCows) sideNavCows.addEventListener("click", () => navigateTo("cows"));
  if (sideNavHistory) sideNavHistory.addEventListener("click", () => navigateTo("history"));
  if (sideNavSettings) sideNavSettings.addEventListener("click", () => navigateTo("settings"));
  if (sideNavHelp) sideNavHelp.addEventListener("click", () => navigateTo("help"));
  if (btnLogoutWelcome) {
    btnLogoutWelcome.addEventListener("click", () => navigateTo("welcome"));
  }

  // Eventos disparados desde `identity_selector.js` u otros módulos
  window.addEventListener("vaqui:navigate", (e) => {
    const detail = e.detail || {};
    if (detail.view) {
      navigateTo(detail.view, { focus: detail.focus });
    }
  });

  // Si cambia el usuario activo o la lista de usuarios mientras estamos en Configuración o Bienvenida, re-renderizar
  store.subscribe(() => {
    if (currentView === "settings") {
      renderSettingsView();
    } else if (currentView === "welcome") {
      renderWelcomeView();
    }
  });

  /**
   * Renderiza la página principal de Bienvenida / Acceso con fidelidad exacta a
   * `stitch_dark_claymorphic_youth_fintech_web/bienvenida_esto_es_habireto_sobrio/code.html`.
   */
  function renderWelcomeView() {
    if (!welcomeSection) return;
    const users = store.getUsers();
    const active = store.getActiveUser();

    welcomeSection.innerHTML = `
      <div class="bg-surface font-body text-on-surface antialiased selection:bg-primary-light selection:text-primary min-h-screen flex flex-col justify-between">
        <!-- Header fijo superior -->
        <header class="fixed top-0 left-0 w-full z-50 bg-[#FAF6F0]/90 backdrop-blur-md border-b border-surface-border">
          <div class="h-20 w-full max-w-7xl mx-auto px-5 md:px-8 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-sm shadow-primary/20">
                <span class="material-symbols-outlined text-[22px]">savings</span>
              </div>
              <div class="flex flex-col">
                <span class="font-rounded-display text-xl text-on-surface font-extrabold tracking-tight">Va<span class="text-primary">qui</span></span>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <button
                type="button"
                id="btnReturnVaultHeader"
                title="Entrar al panel como ${active ? active.name : "Titular"}"
                class="w-9 h-9 rounded-full bg-primary-light border border-primary/20 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-colors cursor-pointer"
              >
                <span class="material-symbols-outlined text-[19px]">person</span>
              </button>
            </div>
          </div>
        </header>

        <!-- Contenido Principal -->
        <main class="w-full pt-20 bg-surface flex-grow">
          <div class="flex flex-col w-full">
            <!-- Hero Section con Ambient Glow -->
            <div class="relative w-full overflow-hidden">
              <div class="absolute -top-32 left-1/2 -translate-x-1/2 w-[720px] h-[340px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
              <div class="w-full max-w-7xl mx-auto px-5 md:px-8 pt-10 md:pt-14 pb-16">
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                  <!-- Columna Izquierda: Propuesta de Valor Editorial -->
                  <div class="lg:col-span-7 flex flex-col justify-center pt-2">
                    <!-- Pill Badge -->
                    <div class="inline-flex items-center gap-2 self-start px-3.5 py-1.5 rounded-full bg-white border border-surface-border shadow-xs">
                      <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                    </div>

                    <!-- Hero Headline -->
                    <div class="mt-6">
                      <h1 class="font-rounded-display text-4xl sm:text-5xl lg:text-6xl text-on-surface font-extrabold tracking-tight leading-[1.12]">
                        Esto es <span class="text-primary font-black">Vaqui.</span>
                      </h1>
                      <p class="text-base sm:text-lg text-on-surface-variant mt-4 max-w-xl leading-relaxed">
                        La forma ágil, segura y compartida de gestionar tu dinero, crear vaquitas grupales con amigos y transferir sin comisiones ocultas ni barreras.
                      </p>
                    </div>

                    <!-- Botones de Acción Hero -->
                    <div class="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
                      <button
                        type="button"
                        id="open-register-tab-btn"
                        class="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-primary text-white font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary-hover transition-all active:scale-[0.98] cursor-pointer"
                      >
                        <span class="material-symbols-outlined text-[20px]">person_add</span>
                        <span>Crear cuenta</span>
                      </button>
                      <button
                        type="button"
                        id="open-login-tab-btn"
                        class="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-white border border-surface-border text-on-surface font-bold text-sm shadow-xs hover:bg-surface-container-high transition-all active:scale-[0.98] cursor-pointer"
                      >
                        <span class="material-symbols-outlined text-[20px] text-on-surface-variant">key</span>
                        <span>Iniciar sesión</span>
                      </button>
                    </div>
                  </div>

                  <!-- Columna Derecha: Tarjeta Interactiva de Acceso (Clean Terra Card) -->
                  <div class="lg:col-span-5 w-full">
                    <div class="bg-white rounded-2xl p-6 sm:p-7 border border-surface-border shadow-md shadow-stone-200/50 relative overflow-hidden">
                      <!-- Segmented Header -->
                      <div class="bg-surface-container-low p-1 rounded-full flex items-center mb-6 border border-surface-border/60">
                        <button
                          type="button"
                          id="tab-login"
                          class="flex-1 py-2 rounded-full font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            welcomeTab === "login"
                              ? "bg-primary text-white shadow-xs"
                              : "text-on-surface-variant hover:text-on-surface"
                          }"
                        >
                          <span>Ingresar con Llave</span>
                        </button>
                        <button
                          type="button"
                          id="tab-signup"
                          class="flex-1 py-2 rounded-full font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            welcomeTab === "signup"
                              ? "bg-primary text-white shadow-xs"
                              : "text-on-surface-variant hover:text-on-surface"
                          }"
                        >
                          <span>¿Nuevo aquí?</span>
                        </button>
                      </div>

                      ${
                        welcomeTab === "login"
                          ? `
                            <!-- Panel 1: Login con Llave -->
                            <form id="welcomeLoginForm" class="flex flex-col space-y-4">
                              <div class="flex items-center justify-between">
                                <div>
                                  <h2 class="font-rounded-display text-lg font-bold text-on-surface">Acceso directo</h2>
                                  <p class="text-xs text-on-surface-variant">Usa tu identidad digital @Vaqui</p>
                                </div>
                                <div class="w-10 h-10 rounded-full bg-primary-light border border-primary/20 flex items-center justify-center text-primary">
                                  <span class="material-symbols-outlined text-[20px]">shield_person</span>
                                </div>
                              </div>

                              <div class="flex flex-col gap-1.5 pt-1">
                                <label for="welcomeKeyInput" class="text-xs font-bold text-on-surface">Tu Llave Digital</label>
                                <div class="relative flex items-center">
                                  <span class="absolute left-3.5 text-primary font-bold text-sm">@</span>
                                  <input
                                    type="text"
                                    id="welcomeKeyInput"
                                    value="${active ? active.userKey.replace(/^@/, "") : "ALI111"}"
                                    placeholder="ALI111"
                                    class="w-full bg-surface-container-low text-on-surface border border-surface-border pl-8 pr-4 py-2.5 rounded-xl text-sm font-semibold focus:outline-none focus:border-primary focus:bg-white transition-all uppercase tabular-nums"
                                    required
                                  />
                                </div>
                                <!-- Llaves disponibles en un clic -->
                                <div class="flex flex-wrap gap-1.5 pt-1.5">
                                  ${users
                                    .map(
                                      (u) => `
                                      <button
                                        type="button"
                                        data-quick-key="${u.userKey.replace(/^@/, "")}"
                                        class="welcome-quick-key px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border transition-all tabular-nums cursor-pointer ${
                                          active && active.id === u.id
                                            ? "bg-primary-light text-primary border-primary/30"
                                            : "bg-surface-container-low text-on-surface-variant border-surface-border hover:border-primary"
                                        }"
                                      >
                                        ${u.userKey} · ${u.name.split(" ")[0]}
                                      </button>
                                    `
                                    )
                                    .join("")}
                                </div>
                              </div>

                              <button
                                type="submit"
                                class="w-full py-3.5 rounded-full bg-primary text-white font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary-hover transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <span>Ingresar a mi bóveda</span>
                                <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                              </button>
                            </form>
                          `
                          : `
                            <!-- Panel 2: Registro (Crea tu cuenta Vaqui) -->
                            <form id="welcomeSignupForm" class="flex flex-col space-y-4">
                              <div class="flex items-center justify-between">
                                <div>
                                  <h2 class="font-rounded-display text-lg font-bold text-on-surface">Crea tu cuenta Vaqui</h2>
                                  <p class="text-xs text-on-surface-variant">Comienza a gestionar tus vaquitas compartidas</p>
                                </div>
                                <div class="w-10 h-10 rounded-full bg-primary-light border border-primary/20 flex items-center justify-center text-primary">
                                  <span class="material-symbols-outlined text-[20px]">badge</span>
                                </div>
                              </div>

                              <div class="flex flex-col gap-1.5 pt-1">
                                <label for="welcomeSignupName" class="text-xs font-bold text-on-surface">Nombre completo</label>
                                <input
                                  type="text"
                                  id="welcomeSignupName"
                                  placeholder="Ej. Alice Smith"
                                  required
                                  class="w-full bg-surface-container-low text-on-surface border border-surface-border px-4 py-2.5 rounded-xl text-sm font-medium focus:outline-none focus:border-primary focus:bg-white transition-all"
                                />
                              </div>

                              <div class="flex flex-col gap-1.5">
                                <label for="welcomeSignupEmail" class="text-xs font-bold text-on-surface">Correo electrónico</label>
                                <input
                                  type="email"
                                  id="welcomeSignupEmail"
                                  placeholder="usuario@correo.com"
                                  required
                                  class="w-full bg-surface-container-low text-on-surface border border-surface-border px-4 py-2.5 rounded-xl text-sm font-medium focus:outline-none focus:border-primary focus:bg-white transition-all"
                                />
                              </div>

                              <div class="flex flex-col gap-1.5">
                                <label for="welcomeSignupPhone" class="text-xs font-bold text-on-surface">Número de celular</label>
                                <input
                                  type="tel"
                                  id="welcomeSignupPhone"
                                  maxlength="10"
                                  inputmode="numeric"
                                  pattern="3[0-9]{9}"
                                  placeholder="Ej. 3001234567"
                                  required
                                  class="w-full bg-surface-container-low text-on-surface border border-surface-border px-4 py-2.5 rounded-xl text-sm font-medium focus:outline-none focus:border-primary focus:bg-white transition-all tabular-nums"
                                />
                              </div>

                              <button
                                type="submit"
                                id="btnWelcomeCreateSubmit"
                                class="w-full py-3.5 rounded-full bg-primary text-white font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary-hover transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <span>Crear mi cuenta gratis</span>
                                <span class="material-symbols-outlined text-[18px]">verified</span>
                              </button>
                            </form>
                          `
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Sección 2: Cómo funcionan las Vaquitas (Comparativa con Barras y Aportes) -->
            <section class="w-full bg-white border-y border-surface-border py-16">
              <div class="w-full max-w-7xl mx-auto px-5 md:px-8">
                <div class="flex flex-col mb-10 max-w-2xl">
                  <p class="text-xs font-bold uppercase tracking-wider text-primary mb-1">El poder de las Vaquitas compartidas</p>
                  <div class="font-rounded-display text-2xl sm:text-3xl font-extrabold text-on-surface">Cómo funcionan las Vaquitas</div>
                  <p class="text-sm sm:text-base text-on-surface-variant mt-2 leading-relaxed">
                    Ahorra en grupo, define metas comunes y gestiona aportes de manera transparente según tu necesidad.
                  </p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <!-- Card 1: Vaquita Pública -->
                  <div class="bg-surface rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-surface-border shadow-xs hover:shadow-md transition-all">
                    <div>
                      <div class="flex items-center justify-between mb-5">
                        <div class="w-12 h-12 rounded-2xl bg-white border border-surface-border flex items-center justify-center text-primary shadow-xs">
                          <span class="material-symbols-outlined text-[26px]">groups</span>
                        </div>
                        <span class="text-xs font-bold text-primary bg-primary-light px-3 py-1 rounded-full border border-primary/20">Transparencia Total</span>
                      </div>
                      <h3 class="font-rounded-display text-xl font-bold text-on-surface">Vaquita Pública</h3>
                      <p class="text-sm text-on-surface-variant mt-2 leading-relaxed">
                        Todos los integrantes pueden ver en tiempo real la lista completa de personas que han aportado y el monto exacto de cada uno.
                      </p>
                    </div>

                    <div class="mt-6 space-y-4">
                      <!-- Progress preview -->
                      <div class="bg-white p-4 rounded-xl border border-surface-border shadow-xs">
                        <div class="flex items-center justify-between text-xs font-semibold text-on-surface">
                          <span>Viaje a la Patagonia</span>
                          <span class="font-rounded-metric text-primary font-bold tabular-nums">78%</span>
                        </div>
                        <div class="w-full h-2.5 bg-surface-container-high rounded-full overflow-hidden mt-2 p-0.5">
                          <div class="h-full bg-primary rounded-full w-[78%]"></div>
                        </div>
                        <div class="flex items-center justify-between mt-2.5 text-xs text-on-surface-variant">
                          <span>Recaudado: <span class="font-bold text-on-surface font-rounded-metric tabular-nums">$ 2.340.000</span></span>
                          <span>Meta: <span class="font-bold text-on-surface font-rounded-metric tabular-nums">$ 3.000.000 COP</span></span>
                        </div>
                      </div>

                      <!-- Activity List -->
                      <div class="bg-white p-4 rounded-xl border border-surface-border shadow-xs space-y-2.5">
                        <div class="text-xs font-bold text-on-surface mb-1 flex items-center gap-1.5">
                          <span class="material-symbols-outlined text-primary text-[16px]">receipt_long</span>
                          <span>Últimos aportes visibles</span>
                        </div>
                        <div class="flex items-center justify-between text-xs py-1 border-b border-surface-border/60">
                          <span class="font-semibold text-on-surface">@mateo.soler</span>
                          <span class="font-bold text-primary font-rounded-metric tabular-nums">+$ 500.000</span>
                        </div>
                        <div class="flex items-center justify-between text-xs py-1 border-b border-surface-border/60">
                          <span class="font-semibold text-on-surface">@clara.m</span>
                          <span class="font-bold text-primary font-rounded-metric tabular-nums">+$ 350.000</span>
                        </div>
                        <div class="flex items-center justify-between text-xs py-1">
                          <span class="font-semibold text-on-surface">@tu_usuario</span>
                          <span class="font-bold text-primary font-rounded-metric tabular-nums">+$ 400.000</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Card 2: Vaquita Privada -->
                  <div class="bg-surface rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-surface-border shadow-xs hover:shadow-md transition-all">
                    <div>
                      <div class="flex items-center justify-between mb-5">
                        <div class="w-12 h-12 rounded-2xl bg-white border border-surface-border flex items-center justify-center text-secondary shadow-xs">
                          <span class="material-symbols-outlined text-[26px]">visibility_off</span>
                        </div>
                        <span class="text-xs font-bold text-secondary bg-secondary-container px-3 py-1 rounded-full border border-surface-border">Privacidad y Anonimato</span>
                      </div>
                      <h3 class="font-rounded-display text-xl font-bold text-on-surface">Vaquita Privada</h3>
                      <p class="text-sm text-on-surface-variant mt-2 leading-relaxed">
                        Ideal para causas discretas o sorpresas. Nadie (ni siquiera el creador) ve quién aportó cuánto; solo se notifica que alguien envió un aporte.
                      </p>
                    </div>

                    <div class="mt-6 space-y-4">
                      <!-- Progress preview -->
                      <div class="bg-white p-4 rounded-xl border border-surface-border shadow-xs">
                        <div class="flex items-center justify-between text-xs font-semibold text-on-surface">
                          <span>Regalo Cumpleaños Sorpresa</span>
                          <span class="font-rounded-metric text-primary font-bold tabular-nums">60%</span>
                        </div>
                        <div class="w-full h-2.5 bg-surface-container-high rounded-full overflow-hidden mt-2 p-0.5">
                          <div class="h-full bg-primary rounded-full" style="width: 60%;"></div>
                        </div>
                        <div class="flex items-center justify-between mt-2.5 text-xs text-on-surface-variant">
                          <span>Recaudado: <span class="font-bold text-on-surface font-rounded-metric tabular-nums">$ 1.200.000</span></span>
                          <span>Meta: <span class="font-bold text-on-surface font-rounded-metric tabular-nums">$ 2.000.000 COP</span></span>
                        </div>
                      </div>

                      <!-- Activity List -->
                      <div class="bg-white p-4 rounded-xl border border-surface-border shadow-xs space-y-2.5">
                        <div class="text-xs font-bold text-on-surface mb-1 flex items-center gap-1.5">
                          <span class="material-symbols-outlined text-secondary text-[16px]">notifications_active</span>
                          <span>Avisos anónimos</span>
                        </div>
                        <div class="flex items-center justify-between text-xs py-1 border-b border-surface-border/60">
                          <span class="text-on-surface-variant font-medium">Alguien ha aportado</span>
                          <span class="font-bold text-primary font-rounded-metric tabular-nums">+$ 150.000</span>
                        </div>
                        <div class="flex items-center justify-between text-xs py-1 border-b border-surface-border/60">
                          <span class="text-on-surface-variant font-medium">Alguien ha aportado</span>
                          <span class="font-bold text-primary font-rounded-metric tabular-nums">+$ 200.000</span>
                        </div>
                        <div class="flex items-center justify-between text-xs py-1">
                          <span class="text-on-surface-variant font-medium">Alguien ha aportado</span>
                          <span class="font-bold text-primary font-rounded-metric tabular-nums">+$ 50.000</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>

        <!-- Footer -->
        <footer class="w-full bg-[#FAF6F0] border-t border-surface-border py-6"></footer>
      </div>
    `;

    // Eventos de pestañas y botones en Welcome
    welcomeSection.querySelector("#btnReturnVaultHeader")?.addEventListener("click", () => {
      navigateTo("dashboard");
    });
    welcomeSection.querySelector("#tab-login")?.addEventListener("click", () => {
      welcomeTab = "login";
      renderWelcomeView();
    });
    welcomeSection.querySelector("#tab-signup")?.addEventListener("click", () => {
      welcomeTab = "signup";
      renderWelcomeView();
    });
    welcomeSection.querySelector("#open-register-tab-btn")?.addEventListener("click", () => {
      welcomeTab = "signup";
      renderWelcomeView();
      welcomeSection.querySelector("#welcomeSignupName")?.focus();
    });
    welcomeSection.querySelector("#open-login-tab-btn")?.addEventListener("click", () => {
      welcomeTab = "login";
      renderWelcomeView();
      welcomeSection.querySelector("#welcomeKeyInput")?.focus();
    });

    // Selección rápida de llave existente
    welcomeSection.querySelectorAll(".welcome-quick-key").forEach((btn) => {
      btn.addEventListener("click", () => {
        const keyVal = btn.getAttribute("data-quick-key") || "";
        const input = welcomeSection.querySelector("#welcomeKeyInput");
        if (input) input.value = keyVal;
      });
    });

    // Submit Login con Llave
    const loginForm = welcomeSection.querySelector("#welcomeLoginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const rawKey = (welcomeSection.querySelector("#welcomeKeyInput")?.value || "")
          .trim()
          .toUpperCase()
          .replace(/^@/, "");
        const normalizedKey = `@${rawKey}`;
        const matched = store
          .getUsers()
          .find((u) => (u.userKey || "").toUpperCase() === normalizedKey);

        if (!matched) {
          showToast(`No encontramos una cuenta con la llave ${normalizedKey}`, "error");
          return;
        }
        store.setActiveUser(matched.id);
        showToast(`Sesión iniciada como ${matched.name} (${matched.userKey})`, "success");
        navigateTo("dashboard");
      });
    }

    // Submit Registro de nueva cuenta desde Welcome
    const welcomePhoneInput = welcomeSection.querySelector("#welcomeSignupPhone");
    if (welcomePhoneInput) {
      welcomePhoneInput.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
      });
    }

    const signupForm = welcomeSection.querySelector("#welcomeSignupForm");
    if (signupForm) {
      signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fullName = (welcomeSection.querySelector("#welcomeSignupName")?.value || "").trim();
        const email = (welcomeSection.querySelector("#welcomeSignupEmail")?.value || "").trim();
        const phone = (welcomeSection.querySelector("#welcomeSignupPhone")?.value || "").replace(/\s+/g, "").trim();

        if (!fullName || !email || !phone) {
          showToast("Completa todos los campos requeridos", "error");
          return;
        }
        if (!/^3\d{9}$/.test(phone)) {
          showToast(
            "El número de celular debe tener exactamente 10 dígitos e iniciar por 3 (ej. 3001234567)",
            "warning"
          );
          return;
        }

        const submitBtn = welcomeSection.querySelector("#btnWelcomeCreateSubmit");
        if (submitBtn) submitBtn.disabled = true;

        try {
          const created = await api.createUser({
            full_name: fullName,
            email,
            phone_number: phone,
            initial_balance: 50000,
          });
          store.addUser(created);
          showToast(
            `¡Cuenta creada! Tu llave única es ${created.user_key}`,
            "success",
            4000
          );
          navigateTo("dashboard");
        } catch (err) {
          showToast(err.message, "error");
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }
  }

  /**
   * Renderiza la vista de Configuración y Selector de Cuenta (`configuraci_n_y_selector_de_cuenta_habireto`).
   *
   * @param {string} [focusTarget] - Si es `'register'`, desplaza y enfoca el campo de nombre del formulario.
   */
  function renderSettingsView(focusTarget) {
    const root = document.getElementById("settingsRoot");
    if (!root) return;

    const active = store.getActiveUser();
    const users = store.getUsers();
    const suggestedKey = previewUserKey("", users.length);

    root.innerHTML = `
      <div class="space-y-8">
        <!-- Encabezado de página -->
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 class="text-3xl font-extrabold font-headline text-[#171d1a] tracking-tight">Configuración y Selector de Cuenta</h2>
            <p class="text-sm text-[#5e6660] mt-1 max-w-2xl">
              Administra los parámetros de tu identidad financiera, alterna entre perfiles de usuario o registra nuevas personas en el ecosistema Vaqui.
            </p>
          </div>
          <div class="flex items-center gap-2 bg-[#f5f1ea] px-3.5 py-2 rounded-xl border border-[#e6e1d8] text-xs font-medium text-[#5e6660] shrink-0">
            <span class="material-symbols-outlined text-[#4a7c59] text-[16px]">verified_user</span>
            <span>Perfil Verificado • Zero-Trust Interoperable</span>
          </div>
        </div>

        <!-- Grilla Asimétrica de 12 Columnas -->
        <div class="grid grid-cols-12 gap-7 items-start">
          <!-- Columna Izquierda (5 cols): Tarjeta de Cuenta Activa -->
          <div class="col-span-12 lg:col-span-5 space-y-6">
            <div class="bg-white rounded-2xl border border-[#e6e1d8] shadow-[0_12px_32px_-8px_rgba(23,29,26,0.06)] overflow-hidden">
              <div class="p-6 border-b border-[#f0ece3] flex items-center justify-between bg-gradient-to-br from-[#f5f1ea]/70 to-white">
                <div class="flex items-center gap-3.5">
                  <div class="w-12 h-12 rounded-2xl bg-[#4a7c59] text-white flex items-center justify-center shadow-sm font-headline font-extrabold text-base">
                    ${getInitials(active.name)}
                  </div>
                  <div>
                    <h3 class="text-lg font-extrabold font-headline text-[#171d1a] leading-tight">Cuenta</h3>
                    <p class="text-xs text-[#5e6660]">Información certificada del titular</p>
                  </div>
                </div>
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#e8f2eb] text-[#2f6841] border border-[#c8e0cf]">
                  <span class="w-1.5 h-1.5 rounded-full bg-[#2f6841]"></span>
                  Activa
                </span>
              </div>

              <!-- Lista de metadatos de la cuenta -->
              <div class="p-6 divide-y divide-[#f0ece3]">
                <div class="py-3.5 first:pt-0 flex items-center justify-between gap-4">
                  <span class="text-xs font-semibold text-[#5e6660] uppercase tracking-wider">Titular</span>
                  <span class="text-sm font-bold text-[#171d1a] text-right">${active.name}</span>
                </div>

                <div class="py-3.5 flex items-center justify-between gap-4">
                  <span class="text-xs font-semibold text-[#5e6660] uppercase tracking-wider">Llave única (Bre-B)</span>
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-[#f5f1ea] text-[#4a7c59] border border-[#e2ddd3] tabular-nums">${active.userKey || "@ALI111"}</span>
                    <button
                      type="button"
                      id="btnCopyActiveKeySettings"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold text-[#4a7c59] hover:bg-[#e8f2eb] transition-colors cursor-pointer"
                    >
                      <span class="material-symbols-outlined text-[15px]">content_copy</span>
                      <span>Copiar</span>
                    </button>
                  </div>
                </div>

                <div class="py-3.5 flex items-center justify-between gap-4">
                  <span class="text-xs font-semibold text-[#5e6660] uppercase tracking-wider">Celular</span>
                  <span class="text-sm font-medium text-[#171d1a] font-mono tabular-nums">${(active.phone || "3000000000").replace(/^\+?57\s*/, "")}</span>
                </div>

                <div class="py-3.5 flex items-center justify-between gap-4">
                  <span class="text-xs font-semibold text-[#5e6660] uppercase tracking-wider">Cuenta</span>
                  <span class="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-[#f5f1ea] text-[#171d1a] border border-[#e2ddd3] tabular-nums">${active.accountNumber || "ACC-001"}</span>
                </div>

                <div class="py-3.5 flex items-center justify-between gap-4">
                  <span class="text-xs font-semibold text-[#5e6660] uppercase tracking-wider">Moneda</span>
                  <div class="flex items-center gap-1.5">
                    <span class="text-sm font-bold text-[#171d1a]">COP</span>
                    <span class="text-xs text-[#5e6660]">(Peso Colombiano)</span>
                  </div>
                </div>

                <div class="pt-4 pb-1 flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-semibold text-[#5e6660] uppercase tracking-wider">ID de cuenta (UUID v4)</span>
                    <span class="text-[10px] font-semibold text-[#4a7c59] bg-[#e8f2eb] px-2 py-0.5 rounded">ZERO-TRUST ID</span>
                  </div>
                  <div class="flex items-center justify-between gap-2 bg-[#f5f1ea] px-3 py-2 rounded-xl border border-[#e6e1d8]">
                    <code class="font-mono text-[11px] text-[#5e6660] select-all truncate tabular-nums">${active.accountId}</code>
                    <button
                      type="button"
                      id="btnCopyAccountUuid"
                      class="text-[#5e6660] hover:text-[#171d1a] transition-colors shrink-0 cursor-pointer"
                      title="Copiar UUID"
                    >
                      <span class="material-symbols-outlined text-[15px]">content_copy</span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="px-6 py-3.5 bg-[#f5f1ea]/60 border-t border-[#e6e1d8] flex items-center gap-2 text-xs text-[#5e6660]">
                <span class="material-symbols-outlined text-[#4a7c59] text-[16px]">shield_lock</span>
                <span>Tus datos bancarios están protegidos bajo custodia auditada</span>
              </div>
            </div>

            <!-- Nota informativa de interoperabilidad -->
            <div class="bg-[#e8f2eb]/70 rounded-2xl p-5 border border-[#c8e0cf] flex items-start gap-3.5">
              <div class="w-9 h-9 rounded-xl bg-white border border-[#c8e0cf] flex items-center justify-center text-[#4a7c59] shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-[20px]">lightbulb</span>
              </div>
              <div class="text-xs text-[#2e3230] leading-relaxed">
                <p class="font-bold text-[#171d1a] uppercase tracking-wider mb-0.5">Tip de Interoperabilidad</p>
                Cualquier usuario de la red Bre-B en Colombia puede enviarte transferencias directas sin costo utilizando únicamente tu llave <strong class="text-[#171d1a] font-mono">${active.userKey || "@ALI111"}</strong>.
              </div>
            </div>
          </div>

          <!-- Columna Derecha (7 cols): Selector de Cuenta + Registro -->
          <div class="col-span-12 lg:col-span-7 space-y-7">
            <!-- Tarjeta A: Cambiar de cuenta -->
            <div class="bg-white rounded-2xl border border-[#e6e1d8] shadow-[0_12px_32px_-8px_rgba(23,29,26,0.06)] p-6">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 border-b border-[#f0ece3]">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-[#f5f1ea] text-[#4a7c59] flex items-center justify-center border border-[#e6e1d8]">
                    <span class="material-symbols-outlined text-[22px]">switch_account</span>
                  </div>
                  <div>
                    <h3 class="text-lg font-extrabold font-headline text-[#171d1a] leading-tight">Cambiar de cuenta</h3>
                    <p class="text-xs text-[#5e6660]">Alterna al instante entre identidades registradas en este dispositivo</p>
                  </div>
                </div>
                <span class="text-xs font-semibold text-[#5e6660] bg-[#f5f1ea] px-3 py-1 rounded-lg border border-[#e6e1d8] tabular-nums self-start sm:self-auto">
                  ${users.length} personas disponibles
                </span>
              </div>

              <div class="mt-5 space-y-3">
                ${users
                  .map((u) => {
                    const isCurrent = active && active.id === u.id;
                    return `
                      <div
                        class="flex items-center justify-between p-4 rounded-xl transition-all ${
                          isCurrent
                            ? "border-2 border-[#4a7c59] bg-[#e8f2eb]/70"
                            : "border border-[#e6e1d8] bg-white hover:bg-[#f9f8f5] hover:border-[#d5cfc3]"
                        }"
                      >
                        <div class="flex items-center gap-3.5 min-w-0">
                          <div class="w-11 h-11 rounded-full ${
                            isCurrent
                              ? "bg-[#20462c] text-white shadow-sm"
                              : "bg-[#ebe5db] text-[#5e6660] border border-[#dcd5c9]"
                          } font-headline font-extrabold text-sm flex items-center justify-center shrink-0">
                            ${getInitials(u.name)}
                          </div>
                          <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                              <p class="text-sm font-bold text-[#171d1a] truncate">${u.name}</p>
                              ${
                                isCurrent
                                  ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#4a7c59] text-white">Actual</span>`
                                  : ""
                              }
                            </div>
                            <div class="flex items-center gap-2 mt-1 flex-wrap">
                              <span class="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white text-[#4a7c59] border border-[#c8e0cf] tabular-nums">${u.userKey}</span>
                              <span class="text-xs text-[#5e6660] font-mono tabular-nums">• ${u.accountNumber || "ACC"}</span>
                            </div>
                          </div>
                        </div>

                        <div class="flex items-center gap-2 shrink-0 ml-3">
                          ${
                            isCurrent
                              ? `
                                <div class="w-8 h-8 rounded-full bg-[#e8f2eb] text-[#4a7c59] flex items-center justify-center">
                                  <span class="material-symbols-outlined text-[20px]">check_circle</span>
                                </div>
                              `
                              : `
                                <button
                                  type="button"
                                  data-switch-user-id="${u.id}"
                                  class="btn-switch-account px-3.5 py-1.5 rounded-lg text-xs font-bold text-[#171d1a] bg-white hover:bg-[#4a7c59] hover:text-white transition-colors border border-[#dfd9ce] cursor-pointer"
                                >
                                  Cambiar
                                </button>
                              `
                          }
                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            </div>

            <!-- Tarjeta B: Registrar nueva persona -->
            <div class="bg-white rounded-2xl border border-[#e6e1d8] shadow-[0_12px_32px_-8px_rgba(23,29,26,0.06)] p-6">
              <div class="flex items-center justify-between pb-5 border-b border-[#f0ece3]">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-[#e8f2eb] text-[#4a7c59] flex items-center justify-center border border-[#c8e0cf]">
                    <span class="material-symbols-outlined text-[22px]">person_add</span>
                  </div>
                  <div>
                    <h3 class="text-lg font-extrabold font-headline text-[#171d1a] leading-tight">Registrar nueva persona</h3>
                    <p class="text-xs text-[#5e6660]">Añade un perfil con saldo inicial y genera automáticamente su llave <span class="font-mono font-semibold text-[#171d1a]">@ABC123</span></p>
                  </div>
                </div>
                <span class="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-[#4a7c59] bg-[#e8f2eb] px-2.5 py-1 rounded-md border border-[#c8e0cf]">
                  Llave automática
                </span>
              </div>

              <form id="settingsRegisterForm" class="mt-5 space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="space-y-1.5">
                    <label for="regFullName" class="block text-xs font-bold uppercase tracking-wider text-[#171d1a]">Nombre completo</label>
                    <div class="relative">
                      <span class="material-symbols-outlined text-[#5e6660] text-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">person</span>
                      <input
                        type="text"
                        id="regFullName"
                        placeholder="Diana Morales"
                        required
                        class="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-[#f5f1ea] border border-[#dfd9ce] text-[#171d1a] placeholder:text-[#9a9e9b] focus:outline-none focus:border-[#4a7c59] focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div class="space-y-1.5">
                    <label for="regEmail" class="block text-xs font-bold uppercase tracking-wider text-[#171d1a]">Correo electrónico</label>
                    <div class="relative">
                      <span class="material-symbols-outlined text-[#5e6660] text-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">mail</span>
                      <input
                        type="email"
                        id="regEmail"
                        placeholder="diana@habireto.com"
                        required
                        class="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-[#f5f1ea] border border-[#dfd9ce] text-[#171d1a] placeholder:text-[#9a9e9b] focus:outline-none focus:border-[#4a7c59] focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div class="space-y-1.5">
                    <label for="regPhone" class="block text-xs font-bold uppercase tracking-wider text-[#171d1a]">Celular (10 dígitos)</label>
                    <div class="relative">
                      <span class="material-symbols-outlined text-[#5e6660] text-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">call</span>
                      <input
                        type="tel"
                        id="regPhone"
                        maxlength="10"
                        inputmode="numeric"
                        pattern="3[0-9]{9}"
                        placeholder="3004445555"
                        required
                        class="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-[#f5f1ea] border border-[#dfd9ce] text-[#171d1a] placeholder:text-[#9a9e9b] focus:outline-none focus:border-[#4a7c59] focus:bg-white font-mono tabular-nums transition-all"
                      />
                    </div>
                  </div>

                  <div class="space-y-1.5">
                    <label for="regInitialBalance" class="block text-xs font-bold uppercase tracking-wider text-[#171d1a]">Saldo inicial (COP)</label>
                    <div class="relative">
                      <span class="text-xs font-bold text-[#5e6660] absolute left-3.5 top-1/2 -translate-y-1/2 font-mono">$</span>
                      <input
                        type="number"
                        id="regInitialBalance"
                        value="50000"
                        min="0"
                        step="1000"
                        class="w-full pl-8 pr-12 py-2.5 text-sm font-bold rounded-xl bg-[#f5f1ea] border border-[#dfd9ce] text-[#171d1a] focus:outline-none focus:border-[#4a7c59] focus:bg-white font-mono tabular-nums transition-all"
                      />
                      <span class="text-[11px] font-bold text-[#5e6660] absolute right-3.5 top-1/2 -translate-y-1/2">COP</span>
                    </div>
                  </div>
                </div>

                <!-- Banner de previsualización de llave -->
                <div class="flex items-center justify-between gap-4 bg-[#f5f1ea] p-3.5 rounded-xl border border-[#e6e1d8]">
                  <div class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined text-[#4a7c59] text-[18px]">vpn_key</span>
                    <div class="text-xs">
                      <p class="font-bold text-[#171d1a]">Llave única asignada por el sistema:</p>
                      <p class="text-[#5e6660]">Formato estándar Bre-B (@ 3 letras + 3 números)</p>
                    </div>
                  </div>
                  <span id="regKeyPreview" class="font-mono font-bold text-xs px-3 py-1.5 rounded-lg bg-white text-[#171d1a] border border-[#dfd9ce] tabular-nums">${suggestedKey}</span>
                </div>

                <button
                  type="submit"
                  id="btnSubmitRegisterSettings"
                  class="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-bold text-white bg-[#4a7c59] hover:bg-[#3d6749] shadow-sm transition-all cursor-pointer"
                >
                  <span>Registrar persona</span>
                  <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    // Copiar llave única activa
    root.querySelector("#btnCopyActiveKeySettings")?.addEventListener("click", () => {
      navigator.clipboard?.writeText(active.userKey || "@ALI111");
      showToast(`Llave ${active.userKey} copiada al portapapeles`, "success", 2000);
    });

    // Copiar UUID de cuenta
    root.querySelector("#btnCopyAccountUuid")?.addEventListener("click", () => {
      navigator.clipboard?.writeText(active.accountId || "");
      showToast("UUID de cuenta copiado al portapapeles", "info", 2000);
    });

    // Cambiar de cuenta con 1 clic
    root.querySelectorAll(".btn-switch-account").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-switch-user-id");
        const targetUser = store.getUsers().find((u) => String(u.id) === String(targetId));
        if (targetUser) {
          store.setActiveUser(targetUser.id);
          showToast(
            `Cuenta activa cambiada a ${targetUser.name} (${targetUser.userKey})`,
            "success",
            2200
          );
        }
      });
    });

    // Actualizar previsualización de llave al escribir el nombre
    const regFullName = root.querySelector("#regFullName");
    const regKeyPreview = root.querySelector("#regKeyPreview");
    if (regFullName && regKeyPreview) {
      regFullName.addEventListener("input", (e) => {
        regKeyPreview.textContent = previewUserKey(e.target.value, store.getUsers().length);
      });
    }

    // Enviar formulario de registro de nueva persona
    const regPhoneInput = root.querySelector("#regPhone");
    if (regPhoneInput) {
      regPhoneInput.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
      });
    }

    const regForm = root.querySelector("#settingsRegisterForm");
    if (regForm) {
      regForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fullName = (root.querySelector("#regFullName")?.value || "").trim();
        const email = (root.querySelector("#regEmail")?.value || "").trim();
        const phone = (root.querySelector("#regPhone")?.value || "").replace(/\s+/g, "").trim();
        const initialBalance = Number(root.querySelector("#regInitialBalance")?.value || 50000);

        if (!fullName || !email || !phone) {
          showToast("Por favor completa nombre, correo y celular", "error");
          return;
        }
        if (!/^3\d{9}$/.test(phone)) {
          showToast(
            "El número de celular debe tener exactamente 10 dígitos e iniciar por 3 (ej. 3004445555)",
            "warning"
          );
          return;
        }

        const submitBtn = root.querySelector("#btnSubmitRegisterSettings");
        if (submitBtn) submitBtn.disabled = true;

        try {
          const created = await api.createUser({
            full_name: fullName,
            email,
            phone_number: phone,
            initial_balance: initialBalance >= 0 ? initialBalance : 0,
          });
          store.addUser(created);
          showToast(
            `¡Persona registrada! Llave asignada: ${created.user_key}`,
            "success",
            4000
          );
          renderSettingsView();
        } catch (err) {
          showToast(err.message, "error");
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    if (focusTarget === "register") {
      setTimeout(() => {
        const input = root.querySelector("#regFullName");
        if (input) {
          input.scrollIntoView({ behavior: "smooth", block: "center" });
          input.focus();
        }
      }, 60);
    }
  }

  /**
   * Renderiza la vista de Ayuda / Preguntas Frecuentes (`ayuda_preguntas_frecuentes_habireto`).
   */
  function renderHelpView() {
    const root = document.getElementById("helpRoot");
    if (!root) return;

    root.innerHTML = `
      <div class="max-w-4xl mx-auto space-y-6">
        <!-- Encabezado de página -->
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
          <div>
            <h2 class="text-2xl font-extrabold font-headline tracking-tight text-[#171d1a]">Preguntas Frecuentes</h2>
            <p class="text-sm text-[#5e6660] mt-1">
              Aprende a gestionar tus cuentas, transferir con llaves únicas y sacarle el máximo provecho a los bolsillos grupales con protocolos transparentes y de privacidad.
            </p>
          </div>
          <div class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#e8f2eb] border border-[#c8e0cf] text-xs font-semibold text-[#20462c]">
            <span class="w-2 h-2 rounded-full bg-[#4a7c59]"></span>
            <span>Base de Conocimiento Vaqui</span>
          </div>
        </div>

        <!-- Acordeón / Tarjetas FAQ Terra -->
        <div class="space-y-4">
          <!-- FAQ 1: ¿Qué es una Vaquita y cómo funciona? -->
          <details class="group bg-white rounded-2xl border border-[#e5e0d6] shadow-sm overflow-hidden" open>
            <summary class="p-6 flex items-start justify-between gap-4 cursor-pointer list-none">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-[#4a7c59]/10 text-[#4a7c59] flex items-center justify-center shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-[22px]">savings</span>
                </div>
                <div>
                  <p class="text-[11px] font-bold uppercase tracking-wider text-[#5e6660] mb-0.5">Bolsillo Colectivo</p>
                  <h3 class="text-base font-bold font-headline text-[#171d1a]">¿Qué es una Vaquita y cómo funciona?</h3>
                </div>
              </div>
              <span class="w-8 h-8 rounded-lg bg-[#f5f1ea] text-[#4a7c59] flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[20px] transition-transform group-open:rotate-180">expand_more</span>
              </span>
            </summary>

            <div class="px-6 pb-6 pt-1 space-y-4">
              <p class="text-sm text-[#5e6660] leading-relaxed">
                Es un bolsillo grupal para reunir dinero entre varias personas hacia una meta común. El creador define el nombre y la meta en pesos, invita a los participantes usando su llave única (<span class="font-mono text-xs font-semibold text-[#4a7c59] bg-[#f5f1ea] px-1.5 py-0.5 rounded border border-[#e3ded4]">@ABC123</span>), cada invitado aporta desde su saldo disponible y, cuando el organizador decida cerrarla, usa el botón <strong class="font-semibold text-[#171d1a]">«Terminar Vaquita»</strong> para recibir el total recaudado en su cuenta personal.
              </p>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div class="p-3.5 rounded-xl bg-[#f9f8f5] border border-[#ebe6dc] flex items-center gap-3">
                  <span class="w-7 h-7 rounded-full bg-[#e8f2eb] text-[#4a7c59] font-headline font-bold text-xs flex items-center justify-center shrink-0 tabular-nums">1</span>
                  <div class="text-xs">
                    <p class="font-bold text-[#171d1a]">Crea &amp; Define</p>
                    <p class="text-[#5e6660]">Meta en pesos y nombre</p>
                  </div>
                </div>
                <div class="p-3.5 rounded-xl bg-[#f9f8f5] border border-[#ebe6dc] flex items-center gap-3">
                  <span class="w-7 h-7 rounded-full bg-[#e8f2eb] text-[#4a7c59] font-headline font-bold text-xs flex items-center justify-center shrink-0 tabular-nums">2</span>
                  <div class="text-xs">
                    <p class="font-bold text-[#171d1a]">Invita por Llave</p>
                    <p class="text-[#5e6660]">Aportes desde saldo</p>
                  </div>
                </div>
                <div class="p-3.5 rounded-xl bg-[#f9f8f5] border border-[#ebe6dc] flex items-center gap-3">
                  <span class="w-7 h-7 rounded-full bg-[#e8f2eb] text-[#4a7c59] font-headline font-bold text-xs flex items-center justify-center shrink-0 tabular-nums">3</span>
                  <div class="text-xs">
                    <p class="font-bold text-[#171d1a]">Terminar Vaquita</p>
                    <p class="text-[#5e6660]">Liquidación sin comisión</p>
                  </div>
                </div>
              </div>
            </div>
          </details>

          <!-- FAQ 2: ¿Cuáles son los 2 tipos de Vaquita? -->
          <details class="group bg-white rounded-2xl border border-[#e5e0d6] shadow-sm overflow-hidden" open>
            <summary class="p-6 flex items-start justify-between gap-4 cursor-pointer list-none">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-[#4a7c59]/10 text-[#4a7c59] flex items-center justify-center shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-[22px]">lock</span>
                </div>
                <div>
                  <p class="text-[11px] font-bold uppercase tracking-wider text-[#5e6660] mb-0.5">Modos de Privacidad</p>
                  <h3 class="text-base font-bold font-headline text-[#171d1a]">¿Cuáles son los 2 tipos de Vaquita?</h3>
                </div>
              </div>
              <span class="w-8 h-8 rounded-lg bg-[#f5f1ea] text-[#4a7c59] flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[20px] transition-transform group-open:rotate-180">expand_more</span>
              </span>
            </summary>

            <div class="px-6 pb-6 pt-1 space-y-4">
              <p class="text-xs text-[#5e6660]">Dependiendo del objetivo de tu reunión o fondo compartido, puedes configurar la visibilidad al momento de crearla:</p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-5 rounded-xl bg-[#f9f8f5] border border-[#e5e0d6] flex flex-col justify-between space-y-3">
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="inline-flex items-center gap-1.5 text-xs font-bold text-[#20462c] bg-[#e8f2eb] px-2.5 py-1 rounded-lg border border-[#c8e0cf]">
                        <span class="material-symbols-outlined text-[15px]">language</span>
                        1. Vaquita Pública
                      </span>
                      <span class="text-[11px] text-[#5e6660]">Visibilidad total</span>
                    </div>
                    <p class="text-sm text-[#5e6660] leading-relaxed pt-1">
                      El creador puede ver cuánto han aportado todas las personas que invitó (incluso quienes llevan <span class="font-mono font-semibold text-[#171d1a] tabular-nums">$0</span>). Las personas invitadas solo ven los aportes ya realizados por los demás participantes.
                    </p>
                  </div>
                  <div class="pt-2 border-t border-[#e5e0d6] flex items-center gap-1.5 text-xs text-[#5e6660]">
                    <span class="material-symbols-outlined text-[15px] text-[#4a7c59]">check</span>
                    <span>Ideal para planes grupales, salidas y asados.</span>
                  </div>
                </div>

                <div class="p-5 rounded-xl bg-[#f9f8f5] border border-[#e5e0d6] flex flex-col justify-between space-y-3">
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="inline-flex items-center gap-1.5 text-xs font-bold text-[#171d1a] bg-[#f5f1ea] px-2.5 py-1 rounded-lg border border-[#e5e0d6]">
                        <span class="material-symbols-outlined text-[15px]">lock</span>
                        2. Vaquita Privada
                      </span>
                      <span class="text-[11px] text-[#5e6660]">Aportes anónimos</span>
                    </div>
                    <p class="text-sm text-[#5e6660] leading-relaxed pt-1">
                      Solo el creador sabe todas las personas que participan; nadie sabe cuánto aporta cada persona, esto es oculto hasta para el creador. Todos observan únicamente cómo se van llenando los aportes con avisos anónimos como <em class="font-semibold text-[#20462c] not-italic bg-[#e8f2eb] px-1.5 py-0.5 rounded">«Alguien ha aportado $60.000»</em>.
                    </p>
                  </div>
                  <div class="pt-2 border-t border-[#e5e0d6] flex items-center gap-1.5 text-xs text-[#5e6660]">
                    <span class="material-symbols-outlined text-[15px] text-[#4a7c59]">shield</span>
                    <span>Perfecto para regalos sorpresa, cumpleaños y colectas sin presión.</span>
                  </div>
                </div>
              </div>
            </div>
          </details>

          <!-- FAQ 3: ¿Cómo agrego una nueva persona? -->
          <details class="group bg-white rounded-2xl border border-[#e5e0d6] shadow-sm overflow-hidden" open>
            <summary class="p-6 flex items-start justify-between gap-4 cursor-pointer list-none">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-[#4a7c59]/10 text-[#4a7c59] flex items-center justify-center shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-[22px]">person_add</span>
                </div>
                <div>
                  <p class="text-[11px] font-bold uppercase tracking-wider text-[#5e6660] mb-0.5">Cuentas y Perfiles</p>
                  <h3 class="text-base font-bold font-headline text-[#171d1a]">¿Cómo agrego una nueva persona?</h3>
                </div>
              </div>
              <span class="w-8 h-8 rounded-lg bg-[#f5f1ea] text-[#4a7c59] flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[20px] transition-transform group-open:rotate-180">expand_more</span>
              </span>
            </summary>

            <div class="px-6 pb-6 pt-1 space-y-4">
              <p class="text-sm text-[#5e6660] leading-relaxed">
                Usa el botón <strong class="text-[#171d1a] bg-[#f5f1ea] px-2 py-0.5 rounded border border-[#e3ded4]">+ «Registrar persona»</strong> en la barra superior. Al registrarla se crea su cuenta en pesos y se le asigna automáticamente su llave única <code class="font-mono text-xs font-semibold text-[#4a7c59] bg-[#f5f1ea] px-2 py-0.5 rounded border border-[#e3ded4]">@ABC123</code> para enviar dinero o sumarse a Vaquitas.
              </p>

              <div class="p-4 rounded-xl bg-[#f9f8f5] border border-[#e5e0d6] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg bg-[#e8f2eb] text-[#4a7c59] flex items-center justify-center font-bold">+</div>
                  <div class="text-xs">
                    <p class="font-bold text-[#171d1a]">Acceso rápido desde cualquier pantalla</p>
                    <p class="text-[#5e6660]">Ubicado junto al selector de perfil en la cabecera superior.</p>
                  </div>
                </div>
                <button
                  type="button"
                  id="btnHelpGoToSettings"
                  class="px-4 py-2 rounded-lg bg-[#4a7c59] hover:bg-[#3d684a] text-white font-headline font-bold text-xs shrink-0 inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <span>Ir a Configuración</span>
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>
    `;

    root.querySelector("#btnHelpGoToSettings")?.addEventListener("click", () => {
      navigateTo("settings", { focus: "register" });
    });
  }

  // Cierre global de modales: Escape o clic en el fondo oscuro
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelector(".bank-modal-overlay")?.remove();
  });
  document.addEventListener("click", (e) => {
    if (e.target.classList?.contains("bank-modal-overlay")) e.target.remove();
  });

  // 8. Mostrar inmediatamente la página principal ("Esto es Vaqui.") al cargar http://localhost:3000/
  navigateTo("welcome");
});
