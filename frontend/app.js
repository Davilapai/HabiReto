/**
 * Punto de entrada principal (SPA Bootstrapper) para Vaqui (HabiReto Frontend).
 *
 * Coordina la inicialización de los módulos de identidad, navegación lateral Terra,
 * vista de bienvenida/acceso (`bienvenida_esto_es_habireto_sobrio`), panel principal
 * (`dashboard`), fondos colaborativos (`cows`), extracto del Libro Mayor (`history`),
 * configuración y selector de cuenta (`settings`) y centro de ayuda (`help`).
 */

import { api } from "./js/api.js";
import { initDashboard, reloadDashboard } from "./js/components/dashboard.js";
import { initIdentitySelector } from "./js/components/identity_selector.js";
import { initCows, reloadCows } from "./js/components/cows.js";
import { initPrivacyInspector } from "./js/components/privacy_inspector.js";
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

  // 4. Inicializar Inspector de Privacidad Zero-Trust en tiempo real
  initPrivacyInspector("privacyInspectorRoot");

  // 5. Inicializar Módulo de Movimientos / Libro Mayor de partida doble
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

  let currentView = "dashboard";
  let welcomeTab = "login"; // 'login' | 'signup'

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
   * @param {string} view - Identificador de vista ('dashboard'|'cows'|'history'|'settings'|'help'|'welcome').
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
   * Renderiza la pantalla completa de Bienvenida / Acceso (`bienvenida_esto_es_habireto_sobrio`).
   */
  function renderWelcomeView() {
    if (!welcomeSection) return;
    const users = store.getUsers();
    const active = store.getActiveUser();

    welcomeSection.innerHTML = `
      <div class="min-h-screen flex flex-col justify-between bg-[#f9f8f5] text-[#171d1a]">
        <!-- Cabecera superior de bienvenida -->
        <header class="w-full max-w-6xl mx-auto px-6 pt-7 pb-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-[#4a7c59] flex items-center justify-center text-white shadow-sm">
              <span class="material-symbols-outlined text-[22px]">savings</span>
            </div>
            <span class="font-headline font-extrabold text-xl tracking-tight text-[#171d1a]">Vaqui</span>
          </div>
          <button
            type="button"
            id="btnReturnVaultHeader"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#e3dfd5] hover:border-[#4a7c59] text-xs font-bold text-[#171d1a] transition-all shadow-sm"
          >
            <span>Continuar como ${active ? active.name.split(" ")[0] : "Titular"} (${active ? active.userKey : "@ALI111"})</span>
            <span class="material-symbols-outlined text-[16px] text-[#4a7c59]">arrow_forward</span>
          </button>
        </header>

        <!-- Cuerpo Principal Hero + Tarjeta de Acceso -->
        <main class="flex-1 flex flex-col justify-center items-center px-6 py-8">
          <div class="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-12 items-center">
            <!-- Columna Izquierda: Propuesta de Valor -->
            <div class="lg:col-span-7 space-y-6">
              <h1 class="font-headline font-extrabold text-4xl sm:text-5xl lg:text-[54px] text-[#171d1a] tracking-tight leading-[1.08]">
                Esto es <span class="text-[#4a7c59]">Vaqui.</span>
              </h1>
              <p class="text-[#5e6660] text-lg sm:text-xl leading-relaxed max-w-xl font-normal">
                Tu espacio para mover plata entre amigos y armar <strong class="text-[#171d1a] font-semibold">Vaquitas</strong> sin enredos, usando llaves únicas tipo <span class="font-mono text-sm bg-[#ebe7de] px-2 py-0.5 rounded text-[#171d1a] font-medium tabular-nums">@ABC123</span> y respaldado por un libro contable de partida doble.
              </p>
              <div class="pt-2 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  id="heroBtnSignup"
                  class="px-7 py-3.5 rounded-xl bg-[#4a7c59] hover:bg-[#3d684a] text-white font-headline font-bold text-sm tracking-wide transition-colors shadow-sm"
                >
                  Crear cuenta
                </button>
                <button
                  type="button"
                  id="heroBtnLogin"
                  class="px-7 py-3.5 rounded-xl bg-white hover:bg-[#f2efe9] text-[#171d1a] border border-[#e3dfd5] font-headline font-bold text-sm tracking-wide transition-colors"
                >
                  Iniciar sesión
                </button>
              </div>
            </div>

            <!-- Columna Derecha: Tarjeta Interactiva de Acceso -->
            <div class="lg:col-span-5 w-full max-w-md mx-auto lg:max-w-none">
              <div class="bg-white rounded-2xl p-6 sm:p-8 border border-[#e3dfd5] shadow-[0_12px_32px_-8px_rgba(23,29,26,0.05)]">
                <!-- Selector de pestaña -->
                <div class="grid grid-cols-2 p-1 bg-[#f2efe9] rounded-xl mb-6 border border-[#e3dfd5]">
                  <button
                    type="button"
                    id="welcomeTabLogin"
                    class="py-2.5 px-3 rounded-lg font-headline font-bold text-xs transition-all ${
                      welcomeTab === "login"
                        ? "bg-white text-[#171d1a] shadow-sm"
                        : "text-[#5e6660] hover:text-[#171d1a]"
                    }"
                  >
                    Ingresar con Llave
                  </button>
                  <button
                    type="button"
                    id="welcomeTabSignup"
                    class="py-2.5 px-3 rounded-lg font-headline font-bold text-xs transition-all ${
                      welcomeTab === "signup"
                        ? "bg-white text-[#171d1a] shadow-sm"
                        : "text-[#5e6660] hover:text-[#171d1a]"
                    }"
                  >
                    ¿Nuevo aquí?
                  </button>
                </div>

                ${
                  welcomeTab === "login"
                    ? `
                      <form id="welcomeLoginForm" class="space-y-5">
                        <div>
                          <h2 class="font-headline font-bold text-xl text-[#171d1a]">Bienvenido de vuelta</h2>
                          <p class="text-xs text-[#5e6660] mt-1">Ingresa tu llave única asignada para acceder a tu bóveda.</p>
                        </div>

                        <div>
                          <label for="welcomeKeyInput" class="block text-xs font-bold text-[#171d1a] mb-2">Tu Llave Vaqui</label>
                          <div class="relative flex items-center">
                            <span class="absolute left-3.5 font-mono font-bold text-[#4a7c59] text-base select-none">@</span>
                            <input
                              type="text"
                              id="welcomeKeyInput"
                              value="${active ? active.userKey.replace(/^@/, "") : "ALI111"}"
                              maxlength="10"
                              placeholder="ALI111"
                              class="w-full pl-9 pr-4 py-3 bg-[#f9f8f5] border border-[#e3dfd5] rounded-xl font-mono text-sm uppercase tracking-wider text-[#171d1a] placeholder:text-[#5e6660]/40 focus:outline-none focus:border-[#4a7c59] focus:bg-white transition-all tabular-nums"
                              required
                            />
                          </div>
                          <!-- Accesos directos a cuentas registradas -->
                          <div class="mt-3">
                            <p class="text-[11px] font-semibold text-[#5e6660] mb-1.5">Cuentas activas disponibles (clic para elegir):</p>
                            <div class="flex flex-wrap gap-1.5">
                              ${users
                                .map(
                                  (u) => `
                                  <button
                                    type="button"
                                    data-quick-key="${u.userKey.replace(/^@/, "")}"
                                    class="welcome-quick-key px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-all tabular-nums ${
                                      active && active.id === u.id
                                        ? "bg-[#e8f1eb] text-[#4a7c59] border-[#4a7c59]/40"
                                        : "bg-[#f9f8f5] text-[#171d1a] border-[#e3dfd5] hover:border-[#4a7c59]"
                                    }"
                                  >
                                    ${u.userKey} · ${u.name.split(" ")[0]}
                                  </button>
                                `
                                )
                                .join("")}
                            </div>
                          </div>
                        </div>

                        <button
                          type="submit"
                          class="w-full py-3.5 px-5 rounded-xl bg-[#4a7c59] hover:bg-[#3d684a] text-white font-headline font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                        >
                          <span>Ingresar a mi bóveda</span>
                          <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </button>
                      </form>
                    `
                    : `
                      <form id="welcomeSignupForm" class="space-y-4">
                        <div>
                          <h2 class="font-headline font-bold text-xl text-[#171d1a]">Crea tu cuenta en segundos</h2>
                          <p class="text-xs text-[#5e6660] mt-1">Generaremos automáticamente tu llave única <span class="font-mono text-[#171d1a] font-semibold">@ABC123</span>.</p>
                        </div>

                        <div class="space-y-3.5">
                          <div>
                            <label for="welcomeSignupName" class="block text-xs font-bold text-[#171d1a] mb-1.5">Nombre completo</label>
                            <input
                              type="text"
                              id="welcomeSignupName"
                              placeholder="Ej. Valentina Gómez"
                              required
                              class="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e3dfd5] rounded-xl text-sm text-[#171d1a] placeholder:text-[#5e6660]/50 focus:outline-none focus:border-[#4a7c59] focus:bg-white transition-all"
                            />
                          </div>
                          <div>
                            <label for="welcomeSignupEmail" class="block text-xs font-bold text-[#171d1a] mb-1.5">Correo electrónico</label>
                            <input
                              type="email"
                              id="welcomeSignupEmail"
                              placeholder="valentina@ejemplo.co"
                              required
                              class="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e3dfd5] rounded-xl text-sm text-[#171d1a] placeholder:text-[#5e6660]/50 focus:outline-none focus:border-[#4a7c59] focus:bg-white transition-all"
                            />
                          </div>
                          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label for="welcomeSignupPhone" class="block text-xs font-bold text-[#171d1a] mb-1.5">Número de celular</label>
                              <input
                                type="tel"
                                id="welcomeSignupPhone"
                                placeholder="300 123 4567"
                                required
                                class="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e3dfd5] rounded-xl text-sm text-[#171d1a] placeholder:text-[#5e6660]/50 focus:outline-none focus:border-[#4a7c59] focus:bg-white transition-all tabular-nums"
                              />
                            </div>
                            <div>
                              <label for="welcomeSignupBalance" class="block text-xs font-bold text-[#171d1a] mb-1.5">Saldo inicial (COP)</label>
                              <input
                                type="number"
                                id="welcomeSignupBalance"
                                value="50000"
                                min="0"
                                step="1000"
                                class="w-full px-3.5 py-2.5 bg-[#f9f8f5] border border-[#e3dfd5] rounded-xl text-sm font-bold text-[#171d1a] focus:outline-none focus:border-[#4a7c59] focus:bg-white transition-all tabular-nums"
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          type="submit"
                          id="btnWelcomeCreateSubmit"
                          class="w-full py-3.5 px-5 rounded-xl bg-[#4a7c59] hover:bg-[#3d684a] text-white font-headline font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                        >
                          <span>Crear mi cuenta gratis</span>
                          <span class="material-symbols-outlined text-[18px]">check</span>
                        </button>
                      </form>
                    `
                }
              </div>
            </div>
          </div>

          <!-- Sección inferior: Cómo funcionan las Vaquitas -->
          <div class="w-full max-w-6xl mx-auto mt-14 pt-10 border-t border-[#e3dfd5]">
            <div class="mb-6">
              <h2 class="font-headline font-bold text-xl text-[#171d1a]">Cómo funcionan las Vaquitas</h2>
              <p class="text-sm text-[#5e6660] mt-1">Bolsillos grupales para reunir dinero hacia una meta común con reglas claras desde el inicio.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="bg-white rounded-2xl p-6 border border-[#e3dfd5]">
                <div class="flex items-center justify-between mb-3">
                  <span class="font-headline font-bold text-base text-[#171d1a]">Vaquita Pública</span>
                  <span class="text-xs font-semibold px-2.5 py-1 rounded-md bg-[#f2efe9] text-[#4a7c59]">Abierta al grupo</span>
                </div>
                <p class="text-sm text-[#5e6660] leading-relaxed">
                  El creador ve cuánto ha aportado cada invitado (incluso quienes llevan <span class="font-mono text-[#171d1a] font-medium tabular-nums">$0</span>), y los participantes ven los aportes realizados.
                </p>
              </div>
              <div class="bg-white rounded-2xl p-6 border border-[#e3dfd5]">
                <div class="flex items-center justify-between mb-3">
                  <span class="font-headline font-bold text-base text-[#171d1a]">Vaquita Privada</span>
                  <span class="text-xs font-semibold px-2.5 py-1 rounded-md bg-[#f2efe9] text-[#805236]">Montos confidenciales</span>
                </div>
                <p class="text-sm text-[#5e6660] leading-relaxed">
                  Solo el creador conoce quiénes participan, pero los montos individuales son privados para todos: solo se muestran avisos anónimos como <span class="italic text-[#171d1a]">«Alguien ha aportado $60.000»</span>.
                </p>
              </div>
            </div>
          </div>
        </main>

        <footer class="w-full max-w-6xl mx-auto px-6 py-5 border-t border-[#e3dfd5] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#5e6660]">
          <span>Vaqui — Finanzas grupales claras y sin fricción.</span>
          <span class="font-mono tabular-nums">Llaves compatibles @ABC123 • Moneda COP</span>
        </footer>
      </div>
    `;

    // Eventos de pestañas y botones en Welcome
    welcomeSection.querySelector("#btnReturnVaultHeader")?.addEventListener("click", () => {
      navigateTo("dashboard");
    });
    welcomeSection.querySelector("#welcomeTabLogin")?.addEventListener("click", () => {
      welcomeTab = "login";
      renderWelcomeView();
    });
    welcomeSection.querySelector("#welcomeTabSignup")?.addEventListener("click", () => {
      welcomeTab = "signup";
      renderWelcomeView();
    });
    welcomeSection.querySelector("#heroBtnSignup")?.addEventListener("click", () => {
      welcomeTab = "signup";
      renderWelcomeView();
      welcomeSection.querySelector("#welcomeSignupName")?.focus();
    });
    welcomeSection.querySelector("#heroBtnLogin")?.addEventListener("click", () => {
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
    const signupForm = welcomeSection.querySelector("#welcomeSignupForm");
    if (signupForm) {
      signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fullName = (welcomeSection.querySelector("#welcomeSignupName")?.value || "").trim();
        const email = (welcomeSection.querySelector("#welcomeSignupEmail")?.value || "").trim();
        const phone = (welcomeSection.querySelector("#welcomeSignupPhone")?.value || "").trim();
        const initialBalance = Number(
          welcomeSection.querySelector("#welcomeSignupBalance")?.value || 50000
        );

        if (!fullName || !email || !phone) {
          showToast("Completa todos los campos requeridos", "error");
          return;
        }

        const submitBtn = welcomeSection.querySelector("#btnWelcomeCreateSubmit");
        if (submitBtn) submitBtn.disabled = true;

        try {
          const created = await api.createUser({
            full_name: fullName,
            email,
            phone,
            initial_balance: initialBalance >= 0 ? initialBalance : 0,
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
        <!-- Encabezado de página (sin kicker superior para cumplir craft-floor) -->
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 class="text-3xl font-extrabold font-headline text-[#171d1a] tracking-tight">Configuración y Selector de Cuenta</h2>
            <p class="text-sm text-[#5e6660] mt-1 max-w-2xl">
              Consulta los detalles certificados de tu cuenta activa, alterna entre perfiles disponibles o registra un nuevo participante con llave única <span class="font-mono font-semibold text-[#4a7c59]">@ABC123</span>.
            </p>
          </div>
          <div class="flex items-center gap-2 bg-[#f5f1ea] px-3.5 py-2 rounded-xl border border-[#e6e1d8] text-xs font-medium text-[#5e6660] shrink-0">
            <span class="material-symbols-outlined text-[#4a7c59] text-[16px]">verified_user</span>
            <span>Entorno Financiero COP • Tiempo Real</span>
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
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold text-[#4a7c59] hover:bg-[#e8f2eb] transition-colors"
                    >
                      <span class="material-symbols-outlined text-[15px]">content_copy</span>
                      <span>Copiar</span>
                    </button>
                  </div>
                </div>

                <div class="py-3.5 flex items-center justify-between gap-4">
                  <span class="text-xs font-semibold text-[#5e6660] uppercase tracking-wider">Celular</span>
                  <span class="text-sm font-medium text-[#171d1a] font-mono tabular-nums">${active.phone || "+57 300 000 0000"}</span>
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
                    <span class="text-[10px] font-semibold text-[#4a7c59] bg-[#e8f2eb] px-2 py-0.5 rounded">Inmutable</span>
                  </div>
                  <div class="flex items-center justify-between gap-2 bg-[#f5f1ea] px-3 py-2 rounded-xl border border-[#e6e1d8]">
                    <code class="font-mono text-[11px] text-[#5e6660] select-all truncate tabular-nums">${active.accountId}</code>
                    <button
                      type="button"
                      id="btnCopyAccountUuid"
                      class="text-[#5e6660] hover:text-[#171d1a] transition-colors shrink-0"
                      title="Copiar UUID"
                    >
                      <span class="material-symbols-outlined text-[15px]">content_copy</span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="px-6 py-3.5 bg-[#f5f1ea]/60 border-t border-[#e6e1d8] flex items-center gap-2 text-xs text-[#5e6660]">
                <span class="material-symbols-outlined text-[#4a7c59] text-[16px]">shield_lock</span>
                <span>Protegido con aislamiento transaccional PostgreSQL</span>
              </div>
            </div>

            <!-- Nota informativa de interoperabilidad -->
            <div class="bg-[#f5f1ea] rounded-2xl p-5 border border-[#e6e1d8] flex items-start gap-3.5">
              <div class="w-9 h-9 rounded-xl bg-white border border-[#e6e1d8] flex items-center justify-center text-[#805236] shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-[20px]">lightbulb</span>
              </div>
              <div class="text-xs text-[#5e6660] leading-relaxed">
                <p class="font-bold text-[#171d1a] mb-0.5">Tip de Interoperabilidad</p>
                Puedes cambiar de perfil en cualquier momento para simular transferencias P2P o verificar la privacidad de una <strong class="text-[#171d1a]">Vaquita Privada</strong> desde la perspectiva de otro invitado.
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
                    <p class="text-xs text-[#5e6660]">Selecciona una identidad para operar desde su bóveda personal</p>
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
                            ? "border-2 border-[#4a7c59] bg-[#f5f9f6]"
                            : "border border-[#e6e1d8] bg-white hover:bg-[#f9f8f5] hover:border-[#d5cfc3]"
                        }"
                      >
                        <div class="flex items-center gap-3.5 min-w-0">
                          <div class="w-11 h-11 rounded-full ${
                            isCurrent
                              ? "bg-[#4a7c59] text-white shadow-sm"
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
                                <span class="text-xs font-bold text-[#4a7c59] hidden sm:inline">En uso</span>
                                <div class="w-8 h-8 rounded-full bg-[#e8f2eb] text-[#4a7c59] flex items-center justify-center">
                                  <span class="material-symbols-outlined text-[20px]">check_circle</span>
                                </div>
                              `
                              : `
                                <button
                                  type="button"
                                  data-switch-user-id="${u.id}"
                                  class="btn-switch-account px-3.5 py-1.5 rounded-lg text-xs font-bold text-[#4a7c59] bg-[#f5f1ea] hover:bg-[#4a7c59] hover:text-white transition-colors border border-[#dfd9ce]"
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
                  <div class="w-10 h-10 rounded-xl bg-[#f5f1ea] text-[#805236] flex items-center justify-center border border-[#e6e1d8]">
                    <span class="material-symbols-outlined text-[22px]">person_add</span>
                  </div>
                  <div>
                    <h3 class="text-lg font-extrabold font-headline text-[#171d1a] leading-tight">Registrar nueva persona</h3>
                    <p class="text-xs text-[#5e6660]">Crea una cuenta en pesos y genera automáticamente su llave <span class="font-mono font-semibold text-[#171d1a]">@ABC123</span></p>
                  </div>
                </div>
                <span class="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-[#805236] bg-[#f7efe8] px-2.5 py-1 rounded-md border border-[#ead8c9]">
                  Creación Instantánea
                </span>
              </div>

              <form id="settingsRegisterForm" class="mt-5 space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="space-y-1.5">
                    <label for="regFullName" class="block text-xs font-bold text-[#171d1a]">Nombre completo</label>
                    <div class="relative">
                      <span class="material-symbols-outlined text-[#5e6660] text-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">badge</span>
                      <input
                        type="text"
                        id="regFullName"
                        placeholder="Ej. David Morales"
                        required
                        class="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-[#f9f8f5] border border-[#dfd9ce] text-[#171d1a] placeholder:text-[#9a9e9b] focus:outline-none focus:border-[#4a7c59] focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div class="space-y-1.5">
                    <label for="regEmail" class="block text-xs font-bold text-[#171d1a]">Correo electrónico</label>
                    <div class="relative">
                      <span class="material-symbols-outlined text-[#5e6660] text-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">mail</span>
                      <input
                        type="email"
                        id="regEmail"
                        placeholder="david@vaqui.co"
                        required
                        class="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-[#f9f8f5] border border-[#dfd9ce] text-[#171d1a] placeholder:text-[#9a9e9b] focus:outline-none focus:border-[#4a7c59] focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div class="space-y-1.5">
                    <label for="regPhone" class="block text-xs font-bold text-[#171d1a]">Celular (WhatsApp / SMS)</label>
                    <div class="relative">
                      <span class="material-symbols-outlined text-[#5e6660] text-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">smartphone</span>
                      <input
                        type="tel"
                        id="regPhone"
                        placeholder="+57 300 456 7890"
                        required
                        class="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-[#f9f8f5] border border-[#dfd9ce] text-[#171d1a] placeholder:text-[#9a9e9b] focus:outline-none focus:border-[#4a7c59] focus:bg-white font-mono tabular-nums transition-all"
                      />
                    </div>
                  </div>

                  <div class="space-y-1.5">
                    <label for="regInitialBalance" class="block text-xs font-bold text-[#171d1a]">Saldo inicial (COP)</label>
                    <div class="relative">
                      <span class="text-xs font-bold text-[#5e6660] absolute left-3.5 top-1/2 -translate-y-1/2 font-mono">$</span>
                      <input
                        type="number"
                        id="regInitialBalance"
                        value="50000"
                        min="0"
                        step="1000"
                        class="w-full pl-8 pr-12 py-2.5 text-sm font-bold rounded-xl bg-[#f9f8f5] border border-[#dfd9ce] text-[#171d1a] focus:outline-none focus:border-[#4a7c59] focus:bg-white font-mono tabular-nums transition-all"
                      />
                      <span class="text-[11px] font-bold text-[#5e6660] absolute right-3.5 top-1/2 -translate-y-1/2">COP</span>
                    </div>
                  </div>
                </div>

                <!-- Banner de previsualización de llave -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[#f0ece3]">
                  <div class="flex items-center gap-2.5 bg-[#f5f1ea] px-3.5 py-2 rounded-xl border border-[#e6e1d8]">
                    <span class="material-symbols-outlined text-[#4a7c59] text-[18px]">vpn_key</span>
                    <div class="text-xs">
                      <span class="text-[#5e6660]">Llave única estimada:</span>
                      <span id="regKeyPreview" class="font-mono font-bold text-[#4a7c59] ml-1 tabular-nums">${suggestedKey}</span>
                    </div>
                  </div>
                  <button
                    type="submit"
                    id="btnSubmitRegisterSettings"
                    class="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-b from-[#4a7c59] to-[#3e6b4b] hover:from-[#427050] hover:to-[#355d40] shadow-sm transition-all cursor-pointer"
                  >
                    <span class="material-symbols-outlined text-[18px]">person_add</span>
                    <span>Registrar persona</span>
                  </button>
                </div>
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
    const regForm = root.querySelector("#settingsRegisterForm");
    if (regForm) {
      regForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fullName = (root.querySelector("#regFullName")?.value || "").trim();
        const email = (root.querySelector("#regEmail")?.value || "").trim();
        const phone = (root.querySelector("#regPhone")?.value || "").trim();
        const initialBalance = Number(root.querySelector("#regInitialBalance")?.value || 50000);

        if (!fullName || !email || !phone) {
          showToast("Por favor completa nombre, correo y celular", "error");
          return;
        }

        const submitBtn = root.querySelector("#btnSubmitRegisterSettings");
        if (submitBtn) submitBtn.disabled = true;

        try {
          const created = await api.createUser({
            full_name: fullName,
            email,
            phone,
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
        <!-- Encabezado de página (sin kicker superior para cumplir craft-floor) -->
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
          <div>
            <h2 class="text-2xl font-extrabold font-headline tracking-tight text-[#171d1a]">Preguntas Frecuentes</h2>
            <p class="text-sm text-[#5e6660] mt-1">
              Todo lo que necesitas saber sobre tus fondos grupales, privacidad y llaves interoperables.
            </p>
          </div>
          <div class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#f5f1ea] border border-[#e3ded4] text-xs font-medium text-[#5e6660]">
            <span class="material-symbols-outlined text-[#4a7c59] text-[18px]">verified_user</span>
            <span>Protocolo de Privacidad Activo</span>
          </div>
        </div>

        <!-- Acordeón / Tarjetas FAQ Terra -->
        <div class="space-y-4">
          <!-- FAQ 1: ¿Qué es una Vaquita y cómo funciona? -->
          <details class="group bg-white rounded-2xl border border-[#e5e0d6] shadow-sm overflow-hidden" open>
            <summary class="p-6 flex items-start justify-between gap-4 cursor-pointer list-none">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-[#4a7c59]/10 text-[#4a7c59] flex items-center justify-center shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-[22px]">groups</span>
                </div>
                <div>
                  <h3 class="text-base font-bold font-headline text-[#171d1a]">¿Qué es una Vaquita y cómo funciona?</h3>
                  <span class="inline-block mt-1 text-[11px] font-semibold text-[#4a7c59] bg-[#4a7c59]/10 px-2.5 py-0.5 rounded-full">Concepto Esencial</span>
                </div>
              </div>
              <span class="w-8 h-8 rounded-lg bg-[#f5f1ea] text-[#4a7c59] flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[20px] transition-transform group-open:rotate-180">expand_more</span>
              </span>
            </summary>

            <div class="px-6 pb-6 pt-1 pl-6 sm:pl-20 space-y-4">
              <p class="text-sm text-[#5e6660] leading-relaxed">
                Es un bolsillo grupal para reunir dinero entre varias personas hacia una meta común. El creador define el nombre y la meta en pesos, invita a los participantes usando su llave única (<span class="font-mono text-xs font-semibold text-[#4a7c59] bg-[#f5f1ea] px-1.5 py-0.5 rounded border border-[#e3ded4]">@ABC123</span>), cada invitado aporta desde su saldo disponible y, cuando el organizador decida cerrarla, usa el botón <strong class="font-semibold text-[#171d1a]">«Terminar Vaquita»</strong> para recibir el total recaudado en su cuenta personal.
              </p>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div class="p-3.5 rounded-xl bg-[#f5f1ea] border border-[#ebe6dc] flex items-center gap-3">
                  <span class="w-7 h-7 rounded-lg bg-white text-[#4a7c59] font-headline font-bold text-xs flex items-center justify-center shadow-sm shrink-0 tabular-nums">1</span>
                  <div class="text-xs">
                    <p class="font-bold text-[#171d1a]">Crea &amp; Define</p>
                    <p class="text-[#5e6660]">Nombre y meta en COP</p>
                  </div>
                </div>
                <div class="p-3.5 rounded-xl bg-[#f5f1ea] border border-[#ebe6dc] flex items-center gap-3">
                  <span class="w-7 h-7 rounded-lg bg-white text-[#4a7c59] font-headline font-bold text-xs flex items-center justify-center shadow-sm shrink-0 tabular-nums">2</span>
                  <div class="text-xs">
                    <p class="font-bold text-[#171d1a]">Invita por Llave</p>
                    <p class="text-[#5e6660]">Con formato @ABC123</p>
                  </div>
                </div>
                <div class="p-3.5 rounded-xl bg-[#f5f1ea] border border-[#ebe6dc] flex items-center gap-3">
                  <span class="w-7 h-7 rounded-lg bg-white text-[#4a7c59] font-headline font-bold text-xs flex items-center justify-center shadow-sm shrink-0 tabular-nums">3</span>
                  <div class="text-xs">
                    <p class="font-bold text-[#171d1a]">Terminar Vaquita</p>
                    <p class="text-[#5e6660]">Desembolso al creador</p>
                  </div>
                </div>
              </div>
            </div>
          </details>

          <!-- FAQ 2: ¿Cuáles son los 2 tipos de Vaquita? -->
          <details class="group bg-white rounded-2xl border border-[#e5e0d6] shadow-sm overflow-hidden" open>
            <summary class="p-6 flex items-start justify-between gap-4 cursor-pointer list-none">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-[#805236]/10 text-[#805236] flex items-center justify-center shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-[22px]">shield_lock</span>
                </div>
                <div>
                  <h3 class="text-base font-bold font-headline text-[#171d1a]">¿Cuáles son los 2 tipos de Vaquita?</h3>
                  <span class="inline-block mt-1 text-[11px] font-semibold text-[#805236] bg-[#805236]/10 px-2.5 py-0.5 rounded-full">Privacidad &amp; Transparencia</span>
                </div>
              </div>
              <span class="w-8 h-8 rounded-lg bg-[#f5f1ea] text-[#4a7c59] flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[20px] transition-transform group-open:rotate-180">expand_more</span>
              </span>
            </summary>

            <div class="px-6 pb-6 pt-1 pl-6 sm:pl-20">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-5 rounded-xl bg-[#f5f1ea]/80 border border-[#e5e0d6] flex flex-col justify-between space-y-3">
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="inline-flex items-center gap-1.5 text-xs font-bold text-[#4a7c59] bg-white px-2.5 py-1 rounded-lg border border-[#e5e0d6] shadow-sm">
                        <span class="material-symbols-outlined text-[15px]">visibility</span>
                        1. Vaquita Pública
                      </span>
                      <span class="text-[11px] font-mono text-[#5e6660]">Transparencia grupal</span>
                    </div>
                    <p class="text-sm text-[#5e6660] leading-relaxed pt-1">
                      El creador puede ver cuánto han aportado todas las personas que invitó (incluso quienes llevan <span class="font-mono font-semibold text-[#171d1a] tabular-nums">$0</span>). Las personas invitadas solo ven los aportes ya realizados por los demás participantes.
                    </p>
                  </div>
                  <div class="pt-2 border-t border-[#e5e0d6] flex items-center justify-between text-xs text-[#5e6660]">
                    <span>Vista de invitados:</span>
                    <span class="font-semibold text-[#171d1a]">Aportes confirmados</span>
                  </div>
                </div>

                <div class="p-5 rounded-xl bg-[#f5f1ea]/80 border border-[#e5e0d6] flex flex-col justify-between space-y-3">
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="inline-flex items-center gap-1.5 text-xs font-bold text-[#805236] bg-white px-2.5 py-1 rounded-lg border border-[#e5e0d6] shadow-sm">
                        <span class="material-symbols-outlined text-[15px]">visibility_off</span>
                        2. Vaquita Privada
                      </span>
                      <span class="text-[11px] font-mono text-[#5e6660]">Zero-Trust Anónimo</span>
                    </div>
                    <p class="text-sm text-[#5e6660] leading-relaxed pt-1">
                      Solo el creador sabe todas las personas que participan; nadie sabe cuánto aporta cada persona, esto es oculto hasta para el creador. Todos observan únicamente avisos anónimos como <em class="font-semibold text-[#4a7c59] not-italic bg-white px-1.5 py-0.5 rounded border border-[#e3ded4]">«Alguien ha aportado $60.000»</em>.
                    </p>
                  </div>
                  <div class="pt-2 border-t border-[#e5e0d6] flex items-center justify-between text-xs text-[#5e6660]">
                    <span>Monto por persona:</span>
                    <span class="font-semibold text-[#805236]">100% Confidencial</span>
                  </div>
                </div>
              </div>
            </div>
          </details>

          <!-- FAQ 3: ¿Cómo funcionan las llaves únicas (@ABC123)? -->
          <details class="group bg-white rounded-2xl border border-[#e5e0d6] shadow-sm overflow-hidden" open>
            <summary class="p-6 flex items-start justify-between gap-4 cursor-pointer list-none">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-[#4a7c59]/10 text-[#4a7c59] flex items-center justify-center shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-[22px]">key</span>
                </div>
                <div>
                  <h3 class="text-base font-bold font-headline text-[#171d1a]">¿Cómo funcionan las llaves únicas (<span class="font-mono text-sm text-[#4a7c59]">@ABC123</span>)?</h3>
                  <span class="inline-block mt-1 text-[11px] font-semibold text-[#5e6660] bg-[#f5f1ea] px-2.5 py-0.5 rounded-full">Inspirado en Bre-B</span>
                </div>
              </div>
              <span class="w-8 h-8 rounded-lg bg-[#f5f1ea] text-[#4a7c59] flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[20px] transition-transform group-open:rotate-180">expand_more</span>
              </span>
            </summary>

            <div class="px-6 pb-6 pt-1 pl-6 sm:pl-20 space-y-3">
              <p class="text-sm text-[#5e6660] leading-relaxed">
                Cada persona tiene una llave única (inspirada en Bre-B) que inicia con <code class="font-mono text-xs font-bold text-[#4a7c59] bg-[#f5f1ea] px-1.5 py-0.5 rounded">@</code> seguida de 3 letras y 3 números (por ejemplo <code class="font-mono text-xs font-semibold text-[#171d1a] bg-[#f5f1ea] px-2 py-0.5 rounded border border-[#e3ded4] tabular-nums">@ALI111</code>, <code class="font-mono text-xs font-semibold text-[#171d1a] bg-[#f5f1ea] px-2 py-0.5 rounded border border-[#e3ded4] tabular-nums">@BOB222</code> o <code class="font-mono text-xs font-semibold text-[#171d1a] bg-[#f5f1ea] px-2 py-0.5 rounded border border-[#e3ded4] tabular-nums">@CHA333</code>). Puedes ver la llave de cada usuario en el panel de cambiar de cuenta y usarla para transferir dinero o invitar personas a una Vaquita sin exponer el listado de todos los usuarios.
              </p>
            </div>
          </details>

          <!-- FAQ 4: ¿Cómo agrego una nueva persona? -->
          <details class="group bg-white rounded-2xl border border-[#e5e0d6] shadow-sm overflow-hidden" open>
            <summary class="p-6 flex items-start justify-between gap-4 cursor-pointer list-none">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-[#4a7c59]/10 text-[#4a7c59] flex items-center justify-center shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-[22px]">person_add</span>
                </div>
                <div>
                  <h3 class="text-base font-bold font-headline text-[#171d1a]">¿Cómo agrego una nueva persona?</h3>
                  <span class="inline-block mt-1 text-[11px] font-semibold text-[#5e6660] bg-[#f5f1ea] px-2.5 py-0.5 rounded-full">Registro Rápido</span>
                </div>
              </div>
              <span class="w-8 h-8 rounded-lg bg-[#f5f1ea] text-[#4a7c59] flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[20px] transition-transform group-open:rotate-180">expand_more</span>
              </span>
            </summary>

            <div class="px-6 pb-6 pt-1 pl-6 sm:pl-20">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p class="text-sm text-[#5e6660] leading-relaxed">
                  Usa el botón <strong class="text-[#171d1a]">«Registrar persona»</strong> en la barra superior o ve a la sección de <strong class="text-[#171d1a]">Configuración</strong>. Al registrarla se crea su cuenta en pesos y se le asigna automáticamente su llave única <code class="font-mono text-xs font-semibold text-[#4a7c59] bg-[#f5f1ea] px-2 py-0.5 rounded border border-[#e3ded4]">@ABC123</code> para enviar dinero o sumarse a Vaquitas.
                </p>
                <button
                  type="button"
                  id="btnHelpGoToSettings"
                  class="px-4 py-2.5 rounded-xl bg-[#4a7c59] hover:bg-[#3d684a] text-white font-headline font-bold text-xs shrink-0 inline-flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <span class="material-symbols-outlined text-[16px]">person_add</span>
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
});
