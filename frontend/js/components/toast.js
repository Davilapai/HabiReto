/**
 * Sistema de notificaciones toast accesible para Modern Digital Banking.
 * 
 * Reemplaza los diálogos nativos del navegador por alertas flotantes con iconografía
 * SVG unificada y soporte para tecnologías de asistencia (WCAG 2.2 AA).
 */

let container = null;

function ensureContainer() {
  if (!container) {
    container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.setAttribute("role", "region");
      container.setAttribute("aria-label", "Notificaciones del sistema");
      document.body.appendChild(container);
    }
  }
  return container;
}

const ICONS = {
  success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16865B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C2413B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B7791F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563A6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

export function showToast(message, type = "info", duration = 4000) {
  const cont = ensureContainer();
  const toast = document.createElement("div");
  toast.className = "bank-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  const iconSvg = ICONS[type] || ICONS.info;

  toast.innerHTML = `
    <span class="flex-shrink-0" style="display:flex;align-items:center;">${iconSvg}</span>
    <span style="flex-grow:1;line-height:1.4;">${message}</span>
    <button type="button" aria-label="Cerrar notificación" style="background:none;border:none;cursor:pointer;padding:4px;color:#98A2B3;display:flex;align-items:center;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  const closeBtn = toast.querySelector("button");
  const dismiss = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "opacity 150ms ease, transform 150ms ease";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 150);
  };

  closeBtn.addEventListener("click", dismiss);

  cont.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}
