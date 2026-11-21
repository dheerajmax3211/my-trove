# My-Trove design language

Status: v2, written for the Phase 2 builders of the public site, the workspace and every product. The tokens live in
`ui-common/packages/tokens`, the components in `ui-common/packages/ui`, and the living reference is the gallery
(`pnpm --filter @platform/gallery dev`, port 5173 by default). If this page and the gallery disagree, the code wins.

## The idea

My-Trove is **a vault you can lend from**. It keeps a household's life data safe, and it lets you hand out exactly as
much as you mean to. The interface should feel like the thing it protects: warm, tactile, calm and precise.

- **Warm**: stone-green paper, brass, a serif that looks set rather than rendered.
- **Tactile**: surfaces have an edge, a top catch of light and a soft contact shadow. Controls press into the page.
- **Calm**: large spacing, one weight of headline, very little motion.
- **Precise**: tabular numbers, hairlines, one idea per icon, plain specific words.

We are not a blue-gradient dashboard, a grid of identical gray cards, an emoji-and-stock-illustration landing page, or a
purple-on-white AI product. If a screen could belong to any SaaS, it is not finished.

### The memorable thing

Spend the boldness in one place: **the vault**. A dark ink band (the "vault surface") with a brass key-bit notch and a
combination-lock dial behind the headline. Everything else stays quiet paper. The three signature elements, all built
from the same parts, are:

1. **The vault surface** (`<Section tone="vault">`, the sidebar, the logo tile): near-black green, stays dark in both themes.
2. **Brass**, used sparingly for what is lent or sealed: the owner badge, the active-page tab, the rule under a page title, the keyhole.
3. **Key bitting** (`<KeyCut />`, the notch before an eyebrow): the repeating cut of a key blade. It is the only decorative pattern.

## Palette

All values are the single source of truth in `packages/tokens/src/colors.ts`; use the CSS variables
(`var(--pp-color-accent)`), never hex, in product code. Ratios are WCAG 2.x, measured by the tokens test, and the test
fails the build if any pair drops below AA (4.5:1 text, 3:1 graphics).

### Core roles

| Role | Light | Dark | Use | Contrast (light / dark) |
|---|---|---|---|---|
| `canvas` | `#F0EFE7` | `#101412` | page background | |
| `surface` | `#FBFAF6` | `#181E1B` | cards, inputs | |
| `surfaceSunken` | `#E6E5DA` | `#0B0E0D` | wells, table heads | |
| `surfaceOverlay` | `#FFFFFF` | `#202825` | dialogs, popovers | |
| `text` | `#15201C` | `#ECE7DC` | body | 14.5 / 15.1 on canvas |
| `textMuted` | `#3E4944` | `#BCC4BE` | secondary | 8.1 / 10.4 |
| `textSubtle` | `#55615B` | `#9AA59F` | hints, timestamps | 5.6 / 7.3 |
| `border` / `hairline` | `#D8D7C9` / `#E3E2D6` | `#2B3430` / `#232B28` | decorative lines | not required |
| `borderStrong` | `#737D77` | `#7F8A84` | control edges | 3.7 / 5.2 |
| `accent` (patina) | `#0E5C52` | `#5FC9B5` | actions, links, focus of attention | label on fill 7.5 / 8.5 |
| `accentText` | `#0E5C52` | `#7ED3C2` | accent used as text | 6.8 / 10.6 |
| `accentSubtle` | `#D8EAE3` | `#17332E` | tinted fills | |
| `brass` | `#A97C1F` | `#D9B45F` | graphic: seals, tabs, rules | 3.3 / 8+ |
| `brassText` | `#6F4F0C` | `#E6C985` | brass as text | 6.5 / 11.5 |
| `brassSubtle` | `#F1E6C9` | `#35290F` | brass tint | |
| `focusRing` | `#C2570C` | `#F5A862` | keyboard focus, 2px | 3.9 / 9.4 |

Semantic states (`danger`, `success`, `warning`, `info`), each with `*Subtle` and `*Text`, all at 7.8 or better as text on
surface in light and 9.2 or better in dark. Colour is never the only signal: badges carry words, callouts carry a glyph
and a title, trends carry an arrow and a spoken "up" or "down".

### Vault surface (dark in both themes)

`vault #0F1F1B` (dark theme `#0B1613`), `vaultRaised #172E28`, `onVault #EEEBDD` (14.3), `onVaultMuted #B3C4BC` (9.4),
`vaultAccent #6FD6C2` (9.8), `vaultBrass #DDB968` (9.1). Put `data-surface="vault"` on any element and the semantic roles
(`text`, `surface`, `accent`, `border`, `focusRing`...) remap to this palette, so any component placed inside is legible with no
extra work. `Section tone="vault"`, the `AppShell` sidebar and the mobile drawer already do this.

### One accent per product

Set `data-product="<id>"` on a wrapper (the workspace does this around each module) and every `--pp-color-accent*` inside
becomes that product's accent: Buttons, Badges, Tabs, links, focus-of-attention, the lot. Outside a wrapper, use
`productVar(id, role)` or `<ProductMark product="..." />`, which always carry the product's own colours.

| Product | Accent (light / dark) | Idea | Label on fill (light / dark) | Text on canvas (light / dark) |
|---|---|---|---|---|
| `waiting-on` | `#8A5A0A` / `#E3AE55` | ochre, things in flight | 5.7 / 9.3 | 6.3 / 10.9 |
| `consent` | `#0E5C52` / `#5FC9B5` | the brand's own patina | 7.5 / 9.3 | 6.8 / 10.6 |
| `home-pulse` | `#2A5C9C` / `#8DB4EE` | harbour blue, sensors | 6.5 / 8.8 | 7.1 / 10.7 |
| `ask-your-life` | `#5B4AA6` / `#B5A8EE` | iris, the only violet | 6.8 / 8.7 | 7.3 / 10.6 |
| `digital-legacy` | `#8C2F4C` / `#EE9BB3` | wine, what is handed on | 7.7 / 8.8 | 8.2 / 10.7 |
| `family-treasury` | `#4D6A1B` / `#A8CC6A` | moss, household money | 5.9 / 10.2 | 6.6 / 12.0 |

Each product also has `-hover`, `-active`, `-subtle`, `-text`, `-on` (all tested). Rules: one product accent per screen; do
not nest a `data-product` wrapper inside a vault surface (the dark accents are tuned for paper); never use a product accent
for a semantic state (an error is `danger`, not wine).

## Type

Self-hosted through `@fontsource` packages (no CDN), Latin subsets, loaded lazily by unicode-range.

- **Display: Young Serif**, one weight (400). A warm, slightly heavy old-style serif that reads as set type. Because it has one
  weight, hierarchy comes from size and space; never request bold (`font-synthesis-weight: none` stops fake bold).
- **Text: Instrument Sans (variable, 400 to 700).** Clean, a little condensed, good numerals. Labels run at 550.
- **Mono: JetBrains Mono (variable).** Ids, keys, hashes, code. Brass-text colour for inline key material.

| Style | Family | Size (375px to 1280px) | Line | Tracking | Use |
|---|---|---|---|---|---|
| `hero` | display | 42 to 76px | 1.05 | -0.028em | one per site page, the opener |
| `displayLg` | display | 36 to 56px | 1.07 | -0.024em | |
| `display` | display | 32 to 44px | 1.09 | -0.02em | section titles |
| `h1` | display | 30 to 36px | 1.17 | -0.015em | page titles (`PageHeader`) |
| `h2` | display | 26px | 34px | -0.01em | dialog and empty-state titles |
| `h3` / `h4` | sans 600 | 20 / 17px | 28 / 24px | | card and group titles |
| `lead` | sans | 18 to 20px | 32px | -0.006em | standfirst under a headline |
| `body` | sans | 16px | 24px | 0 | |
| `bodySmall` / `label` / `caption` | sans | 14 / 14 / 12px | 20 / 20 / 16px | | UI text |
| `stat` | display | 32 to 40px | 1.1 | -0.02em | figures in `Stat` |
| `code` | mono | 13px | 20px | | |

Display styles are fluid (`clamp`); use `var(--pp-text-hero-size)` and friends, which hold the family, size, line, weight and
tracking as separate variables. Measure: body under 70 characters (`max-width: 62ch`), standfirsts 54ch, headlines balanced
(`text-wrap: balance` is on for headings). Sentence case everywhere. **Do not** use all caps for labels, accent a single word
of a headline in italic or colour, or put an eyebrow over every heading: use an eyebrow only to name a place or a product,
and let it carry the key-bit notch.

## Space, shape, elevation

- **Spacing** is a 4px grid: `1 4, 2 8, 3 12, 4 16, 5 20, 6 24, 7 28, 8 32, 10 40, 12 48, 14 56, 16 64, 20 80, 24 96, 32 128, 40 160`.
  Components use 1 to 8; page rhythm uses 10 to 40. `Section` sizes: sm 48px, md 80px, lg 128px, hero 160px (less on phones).
  Be generous: whitespace is part of the calm.
- **Radius**: tight on controls, generous on surfaces. `xs 2`, `sm 4`, `md 8` (buttons, inputs), `lg 14` (cards, callouts),
  `xl 24` (dialogs, hero panels), `2xl 36` (large panels), `full`. Do not use one radius for everything.
- **Elevation** is paper lifting off paper: a tight contact shadow plus one or two long, low, ink-tinted shadows (`xs sm md lg xl`),
  and `inset` for carved-in wells. A raised surface also catches light along its top edge:
  `box-shadow: inset 0 1px 0 var(--pp-color-highlight), var(--pp-shadow-md)`. Never a gray `rgba(0,0,0,.1)` drop shadow.
- **Layout widths**: `narrow 704px` (reading), `content 1152px` (pages), `wide 1312px` (hero compositions). `Container` owns the
  gutters (16, 24, 40px). Never set page max-width or side padding elsewhere.
- **Texture**: `.pp-grain` adds a faint paper tooth (5% noise). `Section tone="paper"` and `"vault"` use it. Do not stack it on
  small components.

## Motion

Motion is tumbler-like: short, decisive, and it settles. It always answers a person's action or announces one arrival.

- Durations: `fast 120ms` (hover, press), `normal 200ms` (reveal), `slow 360ms`, `slower 560ms` (one hero moment).
- Easing: `standard` for state changes, `enter` for things arriving, `exit` for leaving, `settle` (a hair of overshoot) only for
  confirmations: the switch thumb, the dialog arriving. Everything else eases out.
- Allowed: press travel on buttons, the switch click, dialog and palette arriving, the sparkline drawing in once, the dial
  turning once on a hero. **Not allowed**: entrance fade-and-slide on every section, hover transitions on every card, looping
  decoration, parallax.
- **Reduced motion is respected twice**: the tokens collapse every duration to ~0 under `prefers-reduced-motion: reduce`, and
  anything JavaScript starts reads `useReducedMotion()` (the sparkline draw-in, the palette's scroll). Test it.

## Logo

`<Logo />` is a vault-green tile with a brass keyhole whose stem is cut like a key bit, plus the wordmark set in Young
Serif with a brass hyphen. Tones: `color` (default, adapts inside a vault surface), `mono` (one colour, true cut-out keyhole,
follows `currentColor`), `inverse` (force the on-dark version over photographs). Variants: `full`, `mark`, `wordmark`. Sizes:
sm 24, md 32, lg 44, xl 64px tall. Clear space: half the tile width on every side. Minimum: `mark` 16px, `full` 24px tall.
Do not recolour the tile, stretch it, outline it, put it on a busy image, or use the keyhole alone as a decorative pattern.
Favicon: the mark at 32px (see the gallery `index.html` for an SVG data-URI example).

## Illustration and pattern language

- **Ink and tint**: one-weight outlines (1.75px, round joins) in the text colour, flat fills from the page's own palette
  (`surfaceOverlay`, `surfaceSunken`, `accentSubtle`), **one brass detail per drawing**, a soft floor shadow, dashed ghosts for
  "what would be here". No gradients, no people, no mascots, no isometric blobs, no emoji.
- **Six drawings** (`<Illustration name=... />`): `empty` (an open drawer), `search` (a lens that found nothing), `letter`
  (a sealed letter waiting), `key` (access scoped to a tag), `allClear` (a dial at rest with a tick), `locked` (a padlock in a
  dashed ring). They recolour with the theme and with the surrounding `data-product`.
- **Patterns**: `KeyCut` (key bitting strip: dividers, band edges, footers) and `VaultRings` (the dial: hero backdrops, low
  contrast, one per page). Both are decorative and `aria-hidden`.
- **Where**: illustrations go in `EmptyState` for a page or main panel (`illustration` prop). Small cards and table empties use
  the `icon` prop. Every empty state names what belongs there and offers the one next action.

## Iconography

24px grid, 1.75px round strokes, no fills, one idea per glyph, currentColor. Decorative by default (`aria-hidden`); pass `title`
only when the icon is the sole label (then prefer `IconButton label=`). Add a glyph by using `createIcon` in
`packages/ui/src/internal/icons.tsx`. Each product has a glyph via `<ProductMark>`: waiting-on hourglass, consent shield,
home-pulse house with a pulse, ask-your-life chat with a spark, digital-legacy tree, family-treasury coins; `core` is a folder
and `admin` is the settings sliders.

## Component recipes

| You need | Use |
|---|---|
| A marketing page band | `Section` (tone, size, pattern) with `SectionHeader`, inside the page; `Container` to align anything outside a section |
| The hero | `<Section tone="vault" size="hero" pattern="rings">` with `<SectionHeader as="h1" scale="hero" />`, a primary and a secondary `Button size="lg"` |
| A dashboard group | `Section tone="plain" size="sm" container={false}` or just `Card`s in a grid |
| A number | `Stat` (with `goodDirection="down"` for errors and latency), `Sparkline` for the shape |
| Who someone is | `Avatar` + `PersonaBadge` (OWNER brass, ADMIN patina, DEVELOPER blue, MEMBER neutral, AUDITOR ochre) |
| A product | `ProductMark` + the name; wrap its screens in `data-product` |
| Onboarding / wizard | `Stepper` |
| The workspace launcher | `CommandPalette` + `useHotkey('mod+k', ...)` |
| A message in the page | `Callout` (`note` is brass: "lent or sealed" information) |
| Facts about a record | `KeyValueList` (`mono` for ids and keys) |
| History | `Timeline` |
| Nothing here | `EmptyState` with `illustration` |

Page chrome: `AppShell` gives a vault sidebar (brass tab on the active link), a translucent top bar and a 72rem main. Put
`<Logo size="sm" />` in `brand`. `PageHeader` gives the h1 in Young Serif with a brass tab on its rule.

## Do and do not

Do:
- Let the page be quiet and spend the vault, brass and key-bit once per screen.
- Use roles and variables (`var(--pp-color-*)`, `var(--pp-text-*)`), never raw hex or px type sizes.
- Write plain, specific copy in sentence case; name actions the same way throughout a flow ("Publish" then "Published").
- Give every screen a purposeful first thing to look at, and every empty state a next step and an illustration.
- Check light, dark, 375px and keyboard focus before calling a screen done.

Do not:
- Use blue gradients, gradient washes as decoration, gray `rgba(0,0,0,.1)` shadows, or the same radius and shadow on every box.
- Chop a page into identical cards when a list, a table or a plain column would read better.
- Use emoji, stock illustration, mascots, or all-caps tracked-out labels; accent one word of a headline; number things that are
  not a sequence; append arrows to every link.
- Animate sections on scroll, loop motion, or put motion on anything the user did not trigger unless it draws the eye once.
- Nest `data-product` inside a vault surface, or use a product accent for success, warning or error.
- Hide meaning in colour alone, remove focus outlines, or skip the reduced-motion check.

## Accessibility floor

Every colour pair used for text meets 4.5:1 and every graphic that carries meaning meets 3:1, in both themes (tokens test). Focus
is a 2px ring (`focusRing`, 9.4:1 on dark, 3.9:1 on light) with 2px offset on everything keyboard-reachable; on vault surfaces it is
brass. Landmarks and names: one `h1` per page, named regions (`aria-labelledby` on `Section`), a skip link in `AppShell`,
`aria-current` for the current page and step. Touch targets are at least 40px (`control-md`). Phone width (375px) has no
horizontal page scroll; `Stepper` and `Section` rhythm adapt below 576px and 768px.
