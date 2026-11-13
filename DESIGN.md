# DESIGN.md — HabiReto / Vaqui Design System (Terra — Rooted Warmth)

## 1. Visión y Estrella Polar: "Rooted Warmth"
- **Modo:** Operate (Banca digital colaborativa y plataforma contable de alta precisión) + Persuade en vista de Bienvenida.
- **Estilo:** **Terra — Organic Fintech Design**. Cálido, humano y sereno. Tonos tierra desaturados, superficies crema suaves y verde bosque institucional crean una experiencia accesible sin sacrificar rigor contable ni claridad operativa.
- **Prioridad:** Contraste accesible ($\ge 4.5:1$ en cuerpo, $\ge 3:1$ en titulares), separación tonal sobre bordes agresivos, cifras tabulares obligatorias (`tabular-nums`) y retroalimentación clara en cada estado transaccional.

## 2. Paleta de Color Terra
- **Marca Primaria (Forest Green):**
  - Primario (`--color-primary`): `#4a7c59`
  - Hover Primario (`--color-primary-hover`): `#3d6749`
  - Primario Oscuro / Énfasis (`--color-primary-dark`): `#20462c`
  - Contenedor Primario Suave (`--color-primary-light`): `#e8f1eb`
- **Superficies y Bordes (Warm Cream Neutrals):**
  - Fondo de Aplicación (`--color-bg`): `#f9f8f5` / `#faf6f0`
  - Superficie de Tarjetas (`--color-surface`): `#ffffff`
  - Contenedor Bajo / Secundario (`--color-surface-low`): `#f5f1ea`
  - Contenedor Sutil (`--color-surface-subtle`): `#fbf9f6`
  - Borde Estándar (`--color-border`): `#eae5db` / `#e6e0d5`
  - Borde Hover / Activo (`--color-border-hover`): `#d6cfc3`
- **Tipografía y Contraste:**
  - Texto Principal (`--color-text-primary`): `#191c1d` / `#1e2420`
  - Texto Secundario (`--color-text-secondary`): `#5d645e`
  - Texto Sutil (`--color-text-muted`): `#788179`
- **Semántica Financiera:**
  - Crédito / Ingreso / Éxito: `#4a7c59` (Fondo: `#f0f7f2`, Contenedor: `#e8f1eb`)
  - Débito / Egreso / Peligro: `#b83230` (Fondo: `#fdf2f2`, Borde: `#f5c2bf`)
  - Privacidad / Vaquita Privada (Ámbar): `#8e5b22` (Fondo: `#fdf5eb`, Borde: `#fae2c8`)

## 3. Tipografía y Cifras Numéricas
- ** Encabezados y Display:** `Plus Jakarta Sans`, `Outfit`, sans-serif (pesos 600, 700, 800).
- **Cuerpo y Etiquetas:** `Nunito Sans`, sans-serif (pesos 400, 500, 600, 700), altura de línea generosa ($\ge 1.5$).
- **Monospace (Llaves `@ABC123`, UUIDs, Referencias `TRX-XXXX`, Inspector JSON):** `JetBrains Mono`, monospace.
- **Cifras Financieras:** `font-variant-numeric: tabular-nums` obligatorio en saldos, montos, porcentajes, cuotas y tablas del libro mayor.

## 4. Elevación, Componentes y Superficies del Navegador
- **Elevación:** Sombras suaves con desplazamiento vertical y difuminado orgánico (`0 4px 20px rgba(46, 50, 48, 0.06)`).
- **Botones:** Primario en verde sólido `#4a7c59` con texto blanco y radios amplios (`12px` - `16px`); secundario en `#f5f1ea` o `#ffffff` con borde `#eae5db`.
- **Tarjetas:** Relleno `#ffffff` o `#f5f1ea`, padding generoso (`24px` - `28px`), bordes redondeados (`16px` - `24px`) y borde sutil `#eae5db`.
- **Iconografía:** `Material Symbols Outlined` e iconos SVG vectoriales consistentes; prohibido el uso de emojis como iconografía.
- **Superficies del Navegador:** Selección de texto (`::selection`), cursor (`caret-color`), anillos de foco (`:focus-visible`) y barras de desplazamiento personalizadas con la paleta Terra (`#4a7c59` y `#f5f1ea`).
