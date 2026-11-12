# DESIGN.md — HabiReto Fintech Design System

## 1. Visión y Modo de Diseño
- **Modo:** Operate (Banca digital y plataforma contable de alta precisión).
- **Estilo:** Minimalismo tipográfico suizo contemporáneo (Swiss Digital Banking).
- **Prioridad:** Legibilidad inmediata, contraste riguroso ($\ge 4.5:1$ texto general, $\ge 3:1$ encabezados), navegación sin fricción, feedback claro de estados y total fidelidad a la integridad contable.

## 2. Paleta de Color Institucional
- **Primarios Institucionales:**
  - Sidebar Background: `#081424` / `#0C1D33`
  - Marca Primaria: `#173B63`
  - Interacción Hover: `#102F50`
  - Fondo Suave Primario: `#EAF2FA`
- **Superficies y Bordes:**
  - Fondo de Aplicación: `#F4F6F9`
  - Superficie de Tarjetas: `#FFFFFF`
  - Superficie Secundaria: `#F8FAFC`
  - Borde Estándar: `#E5EAF0`
  - Borde Hover / Activo: `#CBD5E1`
- **Semántica Financiera:**
  - Crédito / Ingreso / Éxito: `#16865B` (Fondo: `#EAF6EF`, Borde: `#C4E9D3`)
  - Débito / Egreso / Peligro: `#C2413B` (Fondo: `#FCEEEE`, Borde: `#F5C2BF`)
  - Privacidad / Advertencia: `#B45309` (Fondo: `#FEF3C7`, Borde: `#FDE68A`)
  - Informativo / Bóveda: `#1D4ED8` (Fondo: `#EFF6FF`, Borde: `#BFDBFE`)

## 3. Tipografía y Cifras Numéricas
- **Fuente Principal:** `Inter`, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif.
- **Cifras Financieras:** `tabular-nums` obligatorio para montos, referencias, contadores de saldo y porcentajes.
- **Jerarquía:**
  - Balances Destacados: `32px` - `38px`, peso 700, `letter-spacing: -0.8px`.
  - Títulos de Sección: `18px` - `20px`, peso 700, `letter-spacing: -0.3px`.
  - Títulos de Tarjeta / Modal: `16px` - `17px`, peso 600.
  - Texto Regular / Inputs: `14px`, peso 400 y 500.
  - Metadatos / Etiquetas: `12px` - `13px`, peso 500.
  - Micro-etiquetas y Badges: `11px`, peso 600, mayúsculas o capitalizadas.

## 4. Componentes y Controles
- **Botones:**
  - Primario: Fondo `#173B63`, texto `#FFFFFF`, hover `#102F50`.
  - Secundario: Fondo `#FFFFFF`, borde `#E5EAF0`, texto `#111827`, hover `#F8FAFC`.
  - Peligro / Éxito: Colores semánticos definidos con estados disabled accesibles (opacidad 0.55).
- **Badges:** Altura compacta, radios de 6px, icono SVG acompañante para contexto.
- **Iconografía:** SVGs lineales de 2px de trazo unificado, prohibido el uso de emojis como iconos.
- **Modales:** `<div class="bank-modal-overlay">` con foco visual nítido, backdrop oscuro `rgba(15, 23, 42, 0.45)`, animación suave `scaleUp` y cierre con Escape/botón.
- **Estados:** Vacío (Empty State con ilustración SVG y llamada a la acción), Carga (Skeleton/Spinner coherente), Éxito (Toast feedback con duración automática).
