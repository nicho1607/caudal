# Caudal — Arquitectura, sistema de diseño y roadmap

Gestor de gastos personales con UI ejecutiva. El nombre de trabajo es **Caudal**: es el flujo de dinero que entra y sale, que es justo lo que el producto mide.

---

## 1. Estructura del proyecto

Monorepo simple con una sola app Next.js (App Router) organizada **por feature**. La capa `server/` es la única que habla con Prisma, y toda consulta recibe un `userId` resuelto desde la sesión, nunca desde el cliente.

```
.
├── prisma/
│   ├── schema.prisma          # modelo de datos (ver §2)
│   ├── migrations/
│   └── seed.ts                # usuario demo + categorías + 6 meses de transacciones
├── prisma.config.ts           # Prisma 7: URL de migraciones, ruta del seed
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (app)/                         # rutas autenticadas, comparten el shell
│   │   │   ├── layout.tsx                 # sidebar + topbar + QuickAdd global
│   │   │   ├── dashboard/page.tsx         # RSC: prefetch + HydrationBoundary
│   │   │   ├── transactions/page.tsx
│   │   │   ├── accounts/page.tsx
│   │   │   ├── budgets/page.tsx
│   │   │   ├── goals/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── api/v1/                        # Route Handlers consumidos por TanStack Query
│   │   │   ├── dashboard/route.ts
│   │   │   ├── transactions/route.ts      # GET (filtros) · POST
│   │   │   ├── transactions/[id]/route.ts # PATCH · DELETE (soft) · POST restore
│   │   │   ├── accounts/…  budgets/…  goals/…  categories/…  tags/…
│   │   │   ├── categorize/suggest/route.ts
│   │   │   └── cron/recurring/route.ts    # Vercel Cron, protegido por CRON_SECRET
│   │   ├── globals.css                    # tokens de diseño (ver §3)
│   │   └── layout.tsx                     # fuentes Geist, ThemeProvider, QueryProvider, Toaster
│   ├── components/
│   │   ├── ui/                            # shadcn/ui generado (button, dialog, sheet, command…)
│   │   ├── shell/                         # app-sidebar, topbar, account-switcher
│   │   ├── data-table/                    # wrapper TanStack Table: toolbar, faceted-filter, pagination
│   │   ├── charts/                        # sparkline, chart-tooltip, theme-aware colors
│   │   ├── money.tsx                      # <Money value currency signed /> con tabular-nums
│   │   └── empty-state.tsx
│   ├── features/
│   │   ├── dashboard/   { components/, hooks/, types.ts }
│   │   ├── transactions/{ components/, hooks/, schemas.ts, filters.ts }
│   │   ├── quick-add/   { quick-add-dialog.tsx, parse.ts, use-hotkeys.ts }
│   │   ├── accounts/  budgets/  goals/  categories/
│   ├── server/
│   │   ├── db.ts                          # PrismaClient singleton + @prisma/adapter-pg
│   │   ├── auth.ts                        # getSessionUser() (Supabase SSR)
│   │   ├── services/                      # lógica de negocio pura y testeable
│   │   │   ├── dashboard.service.ts
│   │   │   ├── transaction.service.ts
│   │   │   ├── categorization.service.ts
│   │   │   ├── budget.service.ts
│   │   │   ├── recurring.service.ts
│   │   │   ├── goal.service.ts
│   │   │   └── fx.service.ts
│   │   └── http.ts                        # handler(): auth + zod + mapeo de errores
│   ├── lib/   { format.ts, dates.ts, query-keys.ts, utils.ts }
│   └── generated/prisma/                  # salida del generator (gitignored)
├── tests/ { unit/, e2e/ }
└── docs/ARQUITECTURA.md
```

### Decisiones clave

| Tema | Decisión | Motivo |
|---|---|---|
| Lecturas | RSC hace prefetch → `HydrationBoundary` → `useQuery` en cliente | Primera carga sin spinner y caché viva después |
| Escrituras | Route Handlers + `useMutation` con **optimistic update** | Quick Add y la edición en línea se sienten instantáneos |
| Validación | Zod compartido entre el form (react-hook-form) y el handler | Una sola fuente de verdad |
| Filtros | Estado en la URL con `nuqs` | Vistas filtradas que se pueden compartir y que sobreviven al refresh |
| Tablas | TanStack Table, paginación por cursor en el servidor | Escala a miles de filas |
| Dinero | `Decimal(19,4)` en BD; `number` sólo en agregados del dashboard | Sin errores de coma flotante en saldos |
| Borrado | Soft delete + toast "Deshacer" (5 s) | Fricción cero sin diálogos de confirmación |
| Auth | Supabase Auth; `User.id` = `auth.users.id` | El aislamiento se hace en `server/services` filtrando por `userId` |
| Búsqueda | `pg_trgm` sobre descripción y notas | Búsqueda tolerante a erratas sin infraestructura extra |
| Recurrentes | Cron diario que materializa las reglas con `nextRunAt <= hoy` | Idempotente: avanza `nextRunAt` dentro de la misma transacción SQL |

### Auto-categorización (`categorization.service.ts`)

Recibe `payee` y `description`, los normaliza (minúsculas, sin acentos, sin sufijos como "S.A." o "*1234") y prueba en este orden. Se queda con la primera coincidencia:

1. **Reglas del usuario** (`CategorizationRule` con `source=USER`), por `priority`.
2. **Payee conocido**: usa `Payee.defaultCategoryId`.
3. **Reglas aprendidas** (`source=LEARNED`): cuando el usuario corrige la categoría de un mismo payee 2 veces, se crea una regla.
4. **Reglas semilla** (`source=SYSTEM`): Netflix → Suscripciones, Uber → Transporte, etc.
5. Si nada coincide: no se asigna categoría y la UI la pide.

Cada acierto incrementa `hitCount`. La transacción guarda `autoCategorized` y `categorizationRuleId`, y la UI marca esas filas con un indicador discreto que se puede corregir con un clic.

### Proyección de fin de mes

```
gastoProyectado = gastoReal
                + recurrentesFijosPendientes(resto del mes)
                + mediaDiariaVariable(últimos 90 días) × díasRestantes
ingresoProyectado = ingresoReal + recurrentesIngresoPendientes
```

---

## 2. Base de datos

Está en [`prisma/schema.prisma`](../prisma/schema.prisma). Resumen de relaciones:

```
User 1─* Account 1─* Transaction *─1 Category (árbol: parentId)
User 1─* Payee 1─* Transaction
Transaction *─* Tag              (TransactionTag)
Transaction *─1 RecurringRule    (las genera el cron)
Transaction ── transferGroupId ── Transaction   (2 patas por transferencia)
Category 1─* Budget 1─* BudgetAlert
User 1─* SavingsGoal 1─* GoalContribution ─? Transaction
User 1─* CategorizationRule *─1 Category
ExchangeRate (base, quote, date)
```

Convenciones: importe **con signo** (positivo = entra a la cuenta) y `amountBase` en la moneda base del usuario, para agregar sin recalcular tipos de cambio. Saldo de una cuenta = `initialBalance + Σ amount`.

---

## 3. Sistema de diseño

### Plan

**Color.** Neutros fríos y acentos que significan algo.

| Token | Hex | Uso |
|---|---|---|
| Ink | `#1A1D24` | Texto principal, cifras |
| Slate | `#687385` | Texto secundario, ejes |
| Hairline | `#E4E7EC` | Bordes y divisores (1 px) |
| Paper | `#F8F9FB` | Fondo de la app; las tarjetas son `#FFFFFF` |
| Income | `#1F9D74` | Ingresos, variaciones favorables |
| Expense | `#D4652F` | Gastos (naranja tostado, no rojo alarma) |
| Transfer | `#5B5BD6` | Transferencias y foco interactivo |

El modo oscuro mantiene el mismo matiz con superficies `#15171C` / `#1C1F26`. Los tokens oklch están en [`src/app/globals.css`](../src/app/globals.css).

**Tipografía.** Una sola familia: **Geist** (sans) para todo. **Geist Mono** se usa sólo en importes de tablas densas, donde la alineación por columna importa. Todas las cifras llevan `tabular-nums slashed-zero` (utilidad `num`).

| Rol | Tamaño / interlineado | Peso |
|---|---|---|
| Cifra hero (saldo total) | 32/36, tracking −0.02em | 600 |
| Cifra KPI | 22/28 | 600 |
| Título de sección | 15/22 | 600 |
| Cuerpo / tabla | 13/20 | 400–500 |
| Meta (fechas, ejes) | 12/16 | 400, color Slate |

No se usan etiquetas en mayúsculas ni eyebrows. Cada sección tiene un título en sentence case y nada más.

**Layout.** Rejilla de 12 columnas, contenido alineado a la izquierda, ancho máximo de 1440 px y gutters de 24 px. La densidad se consigue con espaciado de 4 px y filas de tabla de 40 px, sin encoger la tipografía.

**Principios.**
1. **El ritmo de gasto es el protagonista.** Ver "Elemento firma".
2. **El color es semántica.** Verde, naranja y violeta significan ingreso, gasto y transferencia en toda la app, y nada más.
3. **Bordes, no sombras.** Hairlines de 1 px. La sombra se reserva a lo que flota (popover, sheet, command palette).
4. **Jerarquía por tamaño y peso**, no con contenedores: no todo va dentro de una card.

### Revisión del plan contra el brief

Hice el ejercicio de imaginar el dashboard financiero "por defecto": cuatro cards idénticas con sombra suave, un número grande y un sparkline en cada una, y debajo una rejilla de cards del mismo radio. Mi primer borrador era exactamente eso. Cambié tres cosas:

- **Las KPIs pasan a ser una franja segmentada** (un contenedor con divisores verticales) en lugar de cuatro cards sueltas. El brief pide "cards de KPI con sparkline", y cada segmento lo es, pero la franja lee como un solo instrumento, como el encabezado de un estado de cuenta, y ahorra el ruido de 4 bordes y 4 sombras.
- **La jerarquía no es plana.** El saldo total es más grande y va primero. Ingresos, gastos y ahorro se agrupan a su derecha como desglose del mes.
- **Se quitó el gradiente bajo los sparklines.** Ahora son trazo de 1.5 px con relleno al 8 %, en el color semántico de la métrica.

Las directrices del brief (Geist o Inter, grises fríos, la referencia a Stripe, Mercury y Linear) se respetan tal cual.

### Elemento firma: el marcador de ritmo

Toda barra de progreso de presupuesto lleva una **muesca vertical fina que marca dónde "debería" estar el consumo hoy** (día 14 de 30 → 47 %). Si la barra supera la muesca, vas por delante de tu ritmo, aunque no hayas llegado al 80 %. Así la pregunta "¿voy bien este mes?" se responde de un vistazo, antes de que salte la alerta.

El mismo concepto se repite en el gráfico de cash flow: la línea del mes en curso es sólida hasta hoy y **punteada hasta fin de mes** con la proyección. Es la única "audacia" visual; todo lo demás es sobrio.

Movimiento: sólo como respuesta a una acción (abrir un sheet, confirmar un guardado, deshacer). No hay animaciones de entrada por sección. Se respeta `prefers-reduced-motion`.

### Wireframe del dashboard (≥ 1280 px)

```
┌──────────┬──────────────────────────────────────────────────────────────────────┐
│ ◧ Caudal │  Octubre 2026  ‹ ›                       ⌕ Buscar  ⌘K   [+ Nueva  N] │
│          ├──────────────────────────────────────────────────────────────────────┤
│ Resumen  │ ┌──────────────────────┬───────────────┬───────────────┬────────────┐│
│ Movim.   │ │ Saldo total          │ Ingresos      │ Gastos        │ Ahorro neto││
│ Cuentas  │ │ $ 16.383.481         │ $ 4.500.000   │ $ 3.670.200   │ $ 829.800  ││
│ Presup.  │ │ +5,3 % vs sep  ╱╲╱── │ +0 %   ──╱──  │ −4,5 %  ╲╱╲─  │ 18,4 % tasa││
│ Metas    │ └──────────────────────┴───────────────┴───────────────┴────────────┘│
│          │ ┌─ Ingresos vs gastos ──── [Mes|Trim|Año] ─┐ ┌─ Salud financiera ────┐ │
│ ──────── │ │  ▇▅ ▇▆ ▇▄ ▇▅ ▇▆ ▇░                       │ │ Cash flow  +$ 829.800 │ │
│ Cuentas  │ │  barras ingreso/gasto + línea neta       │ │ Tasa ahorro   18,4 %  │ │
│ • Bancol.│ │  mes actual: proyección punteada         │ │ Fijos ▓▓▓▓▓░░ Variab. │ │
│ • Nu Ah. │ │                                          │ │ Fin de mes ≈ +658 mil │ │
│ • Efect. │ └──────────────────────────────────────────┘ └───────────────────────┘ │
│ • T. Nu  │ ┌─ Gasto por categoría ─┐ ┌─ Presupuestos ────────────────────────────┐│
│          │ │      ◯ donut          │ │ Mercado       ▓▓▓▓▓▓▓│░░░ 1,0/1,5 M  69 % ││
│          │ │  $ 3.670.200 total    │ │ Ocio         ▓▓▓▓▓▓▓▓│▓ 564/600 mil ⚠ 94 %││
│          │ │  leyenda con %        │ │ Transporte    ▓▓▓│░░░░░░ 164/400 mil  41 %││
│          │ └───────────────────────┘ │            │ = ritmo esperado hoy (47 %)  ││
│          │                           └───────────────────────────────────────────┘│
│          │ ┌─ Últimos movimientos ─────────────────────────── Ver todos ─────────┐│
│          │ │ 27 oct  Éxito          Mercado ✦       T. Nu   −$ 186.400    ⋯     ││
│          │ │ 26 oct  Bancol. → Nu   Transferencia            $ 600.000    ⋯     ││
│          │ │ 25 oct  Nómina S.A.S.  Nómina          Bancol. +$ 4.500.000  ⋯     ││
│          │ └─────────────────────────────────────────────────────────────────────┘│
└──────────┴──────────────────────────────────────────────────────────────────────┘
✦ = categoría asignada automáticamente (clic para corregir)
```

Por debajo de 768 px: el sidebar pasa a un drawer, la franja de KPIs a un carrusel horizontal con scroll-snap, y los widgets se apilan en una columna en este orden: KPIs, salud financiera, presupuestos, movimientos, gráficos.

### Árbol de componentes del dashboard

```
DashboardPage (RSC, prefetch)
└─ DashboardView (client, useDashboard)
   ├─ KpiStrip → KpiSegment ×4 (value, delta, Sparkline)
   ├─ CashflowChart (Recharts ComposedChart, toggle de rango)
   ├─ FinancialHealthPanel (cash flow, tasa de ahorro, FixedVariableBar, proyección)
   ├─ CategoryDonut (PieChart + leyenda)
   ├─ BudgetList → BudgetProgress (PaceMarker)
   └─ RecentTransactions (filas con DropdownMenu: editar en Sheet, duplicar, eliminar con Deshacer)
```

Cada widget maneja tres estados: **cargando** (skeleton con la forma final, sin spinner), **vacío** (una línea que explica qué falta y un CTA, p. ej. "Aún no hay movimientos este mes." con el botón [Añadir movimiento]) y **error** ("No se pudo cargar. [Reintentar]").

### Quick Add

- `N` (fuera de inputs) abre directamente el formulario. `⌘K` / `Ctrl+K` abre la paleta de comandos, cuya primera acción es "Nueva transacción".
- Un campo de texto libre interpreta entradas como `café 3,50 visa ayer #trabajo`: importe, cuenta por alias, fecha relativa y tags. La categoría se sugiere en vivo al escribir el comercio.
- `Enter` guarda y cierra. `⌘Enter` guarda y deja el formulario abierto para otra. Toast: "Movimiento guardado · Deshacer".

---

## 4. Roadmap

| Fase | Alcance | Criterio de salida |
|---|---|---|
| **0 · Fundaciones** (1 sem) | Next.js + TS strict + Tailwind v4 + shadcn, tokens, Prisma 7 + migración inicial, seed demo, Vitest, CI (typecheck, lint, test) | `npm run typecheck && npm test` en verde; el seed carga 6 meses de datos |
| **1 · MVP** (3 sem) | Shell (sidebar, topbar, tema), Dashboard completo con datos reales, listado de transacciones con filtros y búsqueda, Quick Add, CRUD de cuentas y categorías, auto-categorización por reglas | Un usuario registra, filtra y ve su mes sin salir del teclado |
| **2 · Control** (2 sem) | Presupuestos con alertas al 80/100 %, transacciones recurrentes + cron, metas de ahorro con ETA, tags, edición en Side Sheet, Deshacer | Alertas emitidas una sola vez por umbral y periodo (tests) |
| **3 · Multicuenta pro** (2 sem) | Multimoneda (tipos de cambio diarios del BCE), transferencias entre monedas, importación CSV con dedupe, reglas aprendidas, splits | Saldos correctos en 3 monedas; el CSV de un banco real importa sin duplicados |
| **4 · Producción** (2 sem) | Supabase Auth + onboarding, rate limiting, auditoría de seguridad (aislamiento entre usuarios), observabilidad (Sentry, logs), e2e con Playwright, a11y AA, rendimiento (LCP < 2 s con 10k transacciones) | Checklist de lanzamiento firmado |

Las fases 0–1 están desglosadas en historias ejecutables en [`claude-loop/prd.json`](../claude-loop/prd.json).
