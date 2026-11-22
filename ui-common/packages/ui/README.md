# @platform/ui

Accessible React 19 components built on [Radix UI](https://www.radix-ui.com/) primitives and
`@platform/tokens`, styled with CSS Modules. See the gallery (`pnpm dev`) for every component in light and dark with
live controls, usage snippets and accessibility notes.

```tsx
import '@platform/ui/styles.css' // once, at the app entry: tokens + base + component styles
import { Button, Field, Input } from '@platform/ui'

;<Field label="Email" error={error}>
  <Input type="email" />
</Field>
```

- **Identity**: "a vault you can lend from", v3 (grey canvas, white cards, black, lime and lilac; cinematic dark site), see
  [`docs/design/brand.md`](../../../docs/design/brand.md). Fonts (Plus Jakarta Sans, Young Serif for the site, JetBrains Mono) are self-hosted through `@fontsource` packages that `styles.css` imports; the build copies the font
  files to `dist/assets` so they load lazily by subset.
- **New in v2**: Logo, ProductMark, Section / SectionHeader / Container, Stat, Sparkline, Avatar, PersonaBadge, Stepper,
  CommandPalette (+ `useHotkey`), Callout, KeyValueList, Timeline, EmptyState with an `illustration` slot, six Illustrations,
  KeyCut / VaultRings patterns, `useReducedMotion`, and about 30 more icons.
- **Components**: Button, IconButton, Input, Textarea, Select, Checkbox, Switch, Field / Label / FieldError, Card
  (+ Header/Title/Description/Content/Footer), Badge, Tabs, Dialog, Toast (`ToastProvider`, `useToast`), Tooltip,
  Skeleton, Spinner, EmptyState, DataTable, AppShell (+ SidebarNav / SidebarSection / SidebarLink), PageHeader,
  VisuallyHidden, ThemeProvider (`useTheme`), a small icon set.
- **Build**: Vite library mode, preserved ES modules (`dist/components/**`), one `dist/styles.css`, and `.d.ts`
  from `tsc`. `sideEffects` is limited to CSS, so unused components are tree-shaken.
- **Peer dependencies**: `react` and `react-dom` 19. `radix-ui` is a regular dependency.
- **Theming**: `ThemeProvider` toggles `data-theme` on `<html>`; add the tiny inline script from
  `apps/gallery/index.html` to avoid a flash of the wrong theme before React loads.
- **Overlays in themed regions**: wrap a subtree in `PortalContainerProvider` to make Dialog, Tooltip, Toast and the
  AppShell drawer portal into that element (and so inherit its `data-theme`).
- **Native `<select>`** is used for `Select` on purpose (best mobile and screen reader behavior).
- Checkbox and Switch carry their own label; do not also wrap them in `<Field label>`.

## v3: motion, surfaces, dashboard kit, forms

- **Motion** (`motion`, `lenis` and `gsap` are dependencies of this package; apps never import them directly): `Reveal`, `Stagger`,
  `CountUp`, `Parallax`, `SpotlightCard`, `Magnetic`, `PageTransition`, `ScrollProgress`, `SplitText`, `Marquee`, `SmoothScroll` /
  `useScrollSmooth`, `useScrollStory` / `loadScrollStory` (lazy GSAP + ScrollTrigger), `IndicatorGroup` + `LayoutIndicator`,
  `AnimatedList`, `useInView`. All honour reduced motion.
- **Surfaces**: `Aurora`, `GridGlow`, `Grain`, `GlassPanel`, `GradientBorder`, and Button variants `glow` and `brass`.
- **Dashboard kit**: `AppFrame`, `BentoGrid`, `BentoCard`, `BigStat`, `BubbleChart`, `DotMatrix`, `ProgressStat`, `BarsChart`,
  `PromoCard`, `PillSelect`, `RoundIconButton`, `SearchPill`, `UserChip`.
- **Charts**: `AreaChart`, `BarList`, `Donut` (plain SVG, draw-in on scroll).
- **Forms**: `Form`, `FormSection`, `FormGrid`, `FormActions`, `FileDrop`, `Field variant="floating"`, `Input leading/trailing`.
