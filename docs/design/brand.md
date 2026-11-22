# My-Trove design language

Status: v3 (Phase 2.5), the visual and motion foundation. Tokens live in `ui-common/packages/tokens`, components in
`ui-common/packages/ui`, the living reference is the gallery (`pnpm --filter @platform/gallery dev`, port 5173). Open
`#/dashboard`, `#/forms`, `#/motion` and `#/site` there: they are the patterns to copy. If this page and the gallery disagree,
the code wins.

## The idea

My-Trove is **a vault you can lend from**: it keeps a household's life data safe and lets you hand out exactly as much as you
mean to. v3 keeps that soul and gives it a modern body:

- **The app** is calm, confident and playful: a soft grey canvas, white rounded cards, one black card, and lime and lilac for
  what matters. It sits inside a floating rounded frame, like a well-made object. Big tight numerals, generous radius, almost no
  shadow. (Reference: the "flux" health dashboard; copy its structure, not its content.)
- **The public site** is cinematic: dark, generative motion in place of video, huge type, a pinned scroll story, numbered
  product cards. (Reference: a product site with a hero, a showcase and scroll-driven sections.)
- **The vault** survives as the dark surface (`data-surface="vault"`): the sidebar, the black bento card, the site. The keyhole
  survives as the logo. Brass survives as a rare warm accent for what is lent or sealed.

### The memorable thing

Spend the boldness in one place per screen. In the app: **the huge number** (a `BigStat` with its lime delta pill) and the one
black card. On the site: **the hero headline over the aurora**. Everything else stays quiet.

## Two themes, equally considered

Light is the app default (grey canvas, white cards). Dark is a well-made alternative (ink-black canvas, graphite cards, lime
actions). The site is always dark: put `data-theme="dark"` on its root. Both themes are in
`packages/tokens/src/colors.ts`; use CSS variables (`var(--pp-color-accent)`), never hex. The tokens test fails the build if any
text pair drops below 4.5:1 or any meaningful graphic below 3:1.

### Core roles

| Role                                   | Light                             | Dark                              | Use                                                                              |
| -------------------------------------- | --------------------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `backdrop`                             | `#DCE5B5`                         | `#050505`                         | the soft lime-tinted ground behind the app frame                                 |
| `canvas`                               | `#E4E4E1`                         | `#0D0D0D`                         | the app page                                                                     |
| `surface`                              | `#FFFFFF`                         | `#181818`                         | cards, inputs                                                                    |
| `surfaceSunken`                        | `#EFEFEB`                         | `#090909`                         | wells, tracks, table heads                                                       |
| `surfaceRaised`                        | `#FFFFFF`                         | `#1F1F1F`                         | top of a raised card, secondary buttons                                          |
| `text` / `textMuted` / `textSubtle`    | `#111` / `#43433F` / `#5F5F5A`    | `#F2F2EE` / `#BDBDB6` / `#96968F` | ink                                                                              |
| `border` / `hairline` / `borderStrong` | `#DCDCD6` / `#EDEDE9` / `#7A7A74` | `#2C2C2C` / `#202020` / `#75756F` | lines; `borderStrong` is for control edges                                       |
| `action`                               | `#111111`                         | `#D9F26B`                         | the primary pill: black on paper, lime on dark. Not re-pointed by `data-product` |
| `accent`                               | `#111111`                         | `#D9F26B`                         | actions of attention, links, selected state. **Is** re-pointed by `data-product` |
| `accentSubtle`                         | `#E7F5A6`                         | `#2B3212`                         | the tinted fill (a lime wash)                                                    |
| `lime` / `onLime`                      | `#D9F26B` / `#1A2000`             | same                              | the signature highlight: deltas, counts, promo cards. Same hue in both themes    |
| `lilac` / `onLilac`                    | `#BDB4F4` / `#1B1740`             | same                              | the second hue: charts, bubbles, quiet highlight                                 |
| `brass`                                | `#9A6F14`                         | `#E2BC6A`                         | rare, warm: what is lent or sealed                                               |
| `focusRing`                            | `#5B49D6`                         | `#BDB4F4`                         | keyboard focus (3px glow via `--pp-shadow-focus`)                                |

Plus `danger`, `success`, `warning`, `info` (each with `*Subtle` and `*Text`), `lilacText`, `limeText`, `brassText`. Colour is
never the only signal: badges carry words, trends carry an arrow and a spoken "up" or "down", charts print their values.

**Decoration-only roles** (never carry text alone): `auroraLilac`, `auroraLime`, `auroraBrass`, `auroraPatina` (background
glows and gradient text), `glass`, `glassStrong`, `glassBorder` (frosted surfaces), `spotlight`, `glowAccent`, `glowBrass`.

### Vault surface (dark in both themes)

`vault` is near-black (`#1D1D1D` in light, `#141414` in dark). Put `data-surface="vault"` on any element and the semantic roles
(`text`, `surface`, `action`, `accent`, `border`...) remap to the dark palette, with **lime** as the action and accent. The app
sidebar, the drawer and `<BentoCard tone="dark">` do this. On a coloured card (`tone="lime"`, `PromoCard`) buttons stay black
pills in both themes: those components pin `--pp-color-action` for you.

### One accent per product

Set `data-product="<id>"` on a wrapper and every `--pp-color-accent*` inside becomes that product's colour (icon chips, selected
states, links). The primary button stays the action colour. Each product keeps its signature tint (ochre, patina, harbour blue,
iris, wine, moss; values and contrast in `colors.ts`). Rules: one product accent per screen; never use it for a semantic state;
do not nest a `data-product` wrapper inside a vault surface.

## Type

Self-hosted through `@fontsource` (no CDN).

- **Plus Jakarta Sans (variable)** carries the whole app: headlines, figures, UI, body. Headlines and numerals are set **tight
  and medium** (500, tracking -0.035 to -0.055em). Labels are 600.
- **Young Serif** is the public site's editorial voice only (hero, section titles, big numbers on the site). It never appears in
  the app. Use `var(--pp-font-editorial)`.
- **JetBrains Mono** for ids, keys and code.

| Style                                               | Family         | Size (375px to 1280px)           | Tracking           | Use                                         |
| --------------------------------------------------- | -------------- | -------------------------------- | ------------------ | ------------------------------------------- |
| `displayXl`                                         | display        | 52 to 112px                      | -0.05em            | site hero, one per page                     |
| `hero` / `displayLg` / `display`                    | display        | 44 to 84 / 38 to 60 / 32 to 46px | -0.045 to -0.035em | site sections                               |
| `h1`                                                | display        | 36 to 56px                       | -0.04em            | the app page title (`PageHeader`)           |
| `figure`                                            | display        | 44 to 64px                       | -0.055em           | the huge number on a bento card (`BigStat`) |
| `stat`                                              | display        | 32 to 40px                       | -0.04em            | figures in narrower cards                   |
| `h2` / `h3` / `h4`                                  | display / sans | 28 / 20 / 16px                   |                    | card and group titles                       |
| `lead` / `body` / `bodySmall` / `label` / `caption` | sans           | 20 / 15 / 14 / 14 / 12px         |                    | UI text                                     |

Numerals are always tabular (`font-variant-numeric: tabular-nums`) so figures never jitter while counting. Measure: body under 70
characters. Sentence case everywhere. Do not use all caps for labels, accent a single word of a headline, or put an eyebrow over
every heading.

## Space, shape, depth

- **Spacing** is a 4px grid up to 160px. Components use 1 to 8; page rhythm uses 10 to 40. Be generous.
- **Radius** is large on surfaces, full on controls: `sm 6`, `md 12` (inputs), `lg 18`, `xl 28` (cards, dialogs), `2xl 40` (the
  app frame, hero panels), `full` (buttons, pills, chips, search). Do not use one radius for everything.
- **Depth, app:** flat. White on grey is the separation; a hairline at most; `--pp-shadow-sm` on hover. No heavy shadows.
- **Depth, site and glass:** layered. `GlassPanel` (blur plus hairline plus a catch of light), `--pp-shadow-glow` for lime halos,
  `Aurora` behind, `Grain` over, `GradientBorder` for one hero card.
- **Control size**: `sm 36`, `md 44`, `lg 52` px.
- **Layout widths**: `narrow 704`, `content 1152`, `wide 1312`. The app main column uses `wide`.
- **Blur** tokens `--pp-blur-sm|md|lg|xl` (8, 16, 28, 48px). Blur is the costliest effect we use; one glass layer per viewport.

## The app frame and the dashboard pattern

```tsx
<AppFrame brand={<Logo size="sm" title="" />} user={{ name, email }} search={{}} notifications={3}
          sidebar={<SidebarNav>...<SidebarLink active count={3}>Waiting On</SidebarLink>...</SidebarNav>}
          promo={<PromoCard title="Share a key" action={<Button size="sm">Create a key</Button>} />}>
  <PageHeader title="Household" description="..." actions={<PillSelect label="Date range" .../>} />
  <BentoGrid>
    <BentoCard span={5} title="Requests in flight" icon={...} onMenu={...}>
      <BigStat value={24} unit="open today" delta="+5%" secondary={[{ label: 'Avg reply', value: '3 days' }]} />
      <DotMatrix .../>
    </BentoCard>
    <BentoCard span={3} tone="dark" ...><BarsChart .../></BentoCard>
  </BentoGrid>
</AppFrame>
```

Rules for every product dashboard:

1. Use `AppFrame`; do not build another shell. It gives the skip link, drawer, landmarks, the white-pill current page with a
   lime count, and the header (account chip, search pill, bell).
2. The page title is the loudest thing: `PageHeader` (56px). Subtitle in muted ink. Date or range control as a `PillSelect` on
   the right.
3. Content is a `BentoGrid` of `BentoCard`s: 12 columns, `span` 3 to 6 each, **one `tone="dark"` card and at most one `tone="lime"`
   card** per screen. Each card has the round icon chip, the title and a three-dot menu.
4. Each card has one headline number (`BigStat`, with the lime delta pill) and at most one chart. Pick from: `BubbleChart`
   (up to four overlapping circles), `DotMatrix` (a column per day), `ProgressStat` (thick bar plus a big percent), `BarsChart`
   (hatched bars with one highlighted lime and lilac pair; made for the dark card), `AreaChart`, `BarList`, `Donut`.
5. Chart colour order: lilac, ink, lime, brass. Values are always printed.
6. Mobile: the frame dissolves, the sidebar becomes a drawer, the grid becomes one column.

## Motion

Motion makes the product feel alive and explains what changed. It never decorates for its own sake.

### What to animate

- **Arrival, once:** a page's first view (staggered cards), a number counting up, a chart drawing in, bars growing, bubbles
  popping in on a spring. One orchestrated moment per view; children enter 60 to 80ms apart.
- **Answers to a person's action:** hover lift (1px), press (1px down, scale .985), focus glow, switch thumb, dialog arriving,
  toast sliding in, a tab pill gliding to the active tab, a list item entering or leaving, an error easing open under a field.
- **Cinematic (site only):** `Aurora`, a pinned horizontal scroll story, `SplitText` on the hero, `Marquee`, `SmoothScroll`,
  `Parallax` on one decorative shape, `ScrollProgress`.

### What not to animate

Anything that loops in the app (marquee, aurora, sweeping borders are for the site and the hero only). Body text. Table rows on
every render. Layout properties (`width`, `height`, `top`, `left`, `margin`). More than one entrance per view. Anything the user
has to wait for to continue: no entrance may block input, and no animation longer than 1s except a number or chart draw-in.
Scroll hijacking beyond `SmoothScroll` and one pinned story on the site.

### Durations and easing

| Token                                | Value                        | Use                                             |
| ------------------------------------ | ---------------------------- | ----------------------------------------------- |
| `--pp-duration-fast`                 | 120ms                        | hover, press                                    |
| `--pp-duration-normal`               | 200ms                        | colour and shadow changes                       |
| `--pp-duration-slow`                 | 360ms                        | a pill gliding, a card lifting                  |
| `--pp-duration-slower`               | 560ms                        | an element arriving (dialog, toast, drawer)     |
| `--pp-duration-cinematic`            | 900ms                        | a hero reveal, a chart draw                     |
| `--pp-ease-standard`                 | `(.2,0,0,1)`                 | state changes                                   |
| `--pp-ease-enter` / `--pp-ease-exit` | `(0,0,.2,1)` / `(.4,0,1,1)`  | arriving / leaving                              |
| `--pp-ease-emphasized`               | `(.16,1,.3,1)`               | reveals and page entrances: a long soft landing |
| `--pp-ease-settle`                   | overshoot `(.34,1.32,.64,1)` | confirmations only: switch, tag landing         |
| `--pp-ease-spring`                   | CSS `linear()` spring        | bubbles, dots, file icon                        |

JS springs (`motion`): `motion.spring.snappy` (controls), `smooth` (layout, lists), `gentle` (large surfaces), `bouncy`
(confirmations only), from `@platform/tokens`. Page transitions: 260ms in (rise 10px), 140ms out (drop 6px). Never ease-in on
arrivals.

### Reduced motion

Respected three times: tokens collapse every duration to ~0 under `prefers-reduced-motion: reduce`; every primitive reads
`useReducedMotion()` and renders its final state (no stagger, no count, no parallax, no marquee, no pinned story: the
`useScrollStory` callback is never called); and `SmoothScroll` turns itself off. Static layout must be the default, with motion as
the enhancement. Test it: every primitive has a reduced-motion test.

### Performance budget

- 60fps: animate **`transform` and `opacity` only** (plus colour and shadow on small controls). Scroll reveals, bars (`scaleX`/
  `scaleY`), the sliding pill (`translate3d`), `Marquee` (`translate3d`), `Aurora` blobs (radial gradients that translate and
  scale; no blur filter, no canvas) all follow this. The one exception is `GradientBorder animated` (a custom-property angle):
  one per screen, off by default.
- No layout thrash: measure in an observer or an effect, write CSS variables, never read layout during an animation frame loop.
  `SpotlightCard` writes two custom properties inside `requestAnimationFrame`; React does not re-render per pointer move.
- `will-change` only while moving (reveals drop it on arrival). Decorative loops pause off-screen (`IntersectionObserver`) and
  when the user pauses motion.
- Bundles: `motion` is imported through `m` + `domMax` (tree-shaken); **`gsap` (~45kB gzipped) and `lenis` (~5kB) load lazily**,
  only when a pinned story or smooth scrolling mounts. App code imports them through `@platform/ui`
  (`useScrollStory`, `loadScrollStory`, `SmoothScroll`), never directly.
- Blur: one `backdrop-filter` layer per viewport. Grain is a static tile.

### The primitives

| Need                                       | Use                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Fade, slide, scale into view               | `Reveal` (`direction`, `distance`, `delay`, `scale`)                                |
| Children entering in turn                  | `Stagger` (`BentoGrid` uses it)                                                     |
| A number that lands                        | `CountUp` (`format`, `locale`, `prefix`, `suffix`)                                  |
| Drift against the scroll                   | `Parallax`                                                                          |
| Light that follows the cursor, slight tilt | `SpotlightCard`                                                                     |
| A button that leans toward the cursor      | `Magnetic`                                                                          |
| Route transitions                          | `PageTransition routeKey={pathname}` with `useOutlet()`                             |
| Reading progress                           | `ScrollProgress`                                                                    |
| Headline reveal by word or line            | `SplitText`                                                                         |
| Infinite strip                             | `Marquee`                                                                           |
| Inertial scrolling                         | `SmoothScroll` and `useScrollSmooth()`                                              |
| Pinned or scrubbed story                   | `useScrollStory(ref, ({ gsap, root }) => ...)`                                      |
| A pill gliding between items               | `Tabs` and `SidebarNav` (built in), `IndicatorGroup` + `LayoutIndicator` (your own) |
| Lists that add and remove                  | `AnimatedList` + `AnimatedListItem`                                                 |
| Loading                                    | `Skeleton` (a light sweeps across)                                                  |
| In-view state for your own code            | `useInView`                                                                         |

## Backgrounds and surfaces

`Aurora` (palette `brand | warm | cool`, intensity, pauses itself), `GridGlow`, `Grain`, `GlassPanel`, `GradientBorder` and the
`glow` and `brass` Button variants. Use them on the site, in hero bands and in empty states; **not** on app cards (the app is
flat). Glass needs something behind it. Gradient text: `background: var(--pp-gradient-text)`, large display type only.

## Forms (the pattern)

The owner called the old form the worst UI they had seen, so this is deliberately complete. See `#/forms`.

- Wrap in `Form`. Group in `FormSection` (explanation left, a white card of fields right; stacks on phones). Lay fields out in
  `FormGrid` (2 columns, 1 on phones).
- `Field` has two variants. **`stacked`** (default): label above, optional `hint` on the right of the label row ("Optional",
  "0 / 200"), description under the control. Use for selects, textareas, long labels. **`floating`**: the label sits inside the
  control and lifts on focus or value; use for short single-line inputs. Never mix both in one row.
- Inputs are 44px, 12px radius, a white well on the grey canvas, hairline border, **lilac focus glow**. `Input` takes `leading`
  (decorative icon) and `trailing` (operable). Put units in `trailing`.
- Validation: validate on blur and on submit, never on first keystroke. The error is `role="alert"`, eases open (grid-row
  animation), the control shakes once and turns red. Success draws a lime check, with an optional confirming line ("Looks good").
  Errors say what to do ("Enter an email like name@example.com."), never "Invalid".
- `FileDrop`: a real `<input type="file">` covering a styled drop zone; accepts by `accept`, `maxSize`, `multiple`; rejected files
  explain why; accepted files list with a remove button.
- `FormActions`: a frosted pill pinned to the bottom, status on the left (unsaved changes, errors to fix), actions on the right
  (Discard as ghost, then the primary). Pass `visible={dirty}` so it slides up only when there is something to save.
- Required fields carry `*` and `aria-required`; labels are always real `<label>`s (floating labels are still labels).

## Logo

`<Logo />` is a near-black tile with a lime keyhole whose stem is cut like a key bit, plus the wordmark in Plus Jakarta Sans 700
with a lilac hyphen. Tones: `color` (default, adapts on vault surfaces), `mono` (one colour, true cut-out, follows
`currentColor`), `inverse` (force the on-dark version over photographs). Variants: `full`, `mark`, `wordmark`. Sizes: sm 24, md 32,
lg 44, xl 64px. Clear space: half the tile width. Do not recolour the tile, stretch it or outline it.

## Illustration, iconography, patterns

Unchanged in spirit: one-weight outlines (1.75px round), flat fills from the page palette, no mascots or emoji, six named
drawings (`Illustration`), `KeyCut` and `VaultRings` as decorative patterns (site and hero only), 24px round-stroke icons
(`createIcon`), `ProductMark` per product. `PromoOrb` (a lit sphere with a keyhole) is the one dimensional illustration, for
`PromoCard`.

## Component recipes

| You need                 | Use                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| App chrome               | `AppFrame` (sidebar, header, promo)                                                               |
| A dashboard              | `PageHeader` + `BentoGrid` of `BentoCard` (see above)                                             |
| A big number             | `BigStat`; a smaller one with a trend line: `Stat`                                                |
| A progress bar           | `ProgressStat`                                                                                    |
| A round control          | `RoundIconButton` (`light                                                                         | dark | lime | plain`, `badge`) |
| A date or range dropdown | `PillSelect`                                                                                      |
| A tag or count           | `Badge variant="accent"` (lime), `SidebarCount`, the delta pill in `BigStat`                      |
| A call to action         | `Button variant="primary"` (black / lime), `glow` (lime highlight), `brass` (what is sealed)      |
| A hero                   | the site pattern at `#/site`: `Aurora`, `GridGlow`, `Grain`, `SplitText as="h1"`, `Magnetic` CTAs |
| An announcement          | a time-boxed lime bar (`#/site`)                                                                  |
| Facts, history, empty    | `KeyValueList`, `Timeline`, `EmptyState`                                                          |

## Do and do not

Do: use roles and variables, never raw hex; keep one memorable thing per screen; write plain, specific, sentence-case copy and
name actions the same way throughout a flow; check light, dark, 390px and keyboard focus before calling a screen done; look at it.

Do not: put a serif in the app; stack gradients, glass or grain on app cards; chop a page into identical cards (vary spans and
tones); animate for decoration; use emoji or stock art; number things that are not a sequence; hide meaning in colour; remove
focus outlines; skip the reduced-motion check.

## Accessibility floor

Every colour pair used for text meets 4.5:1 and every graphic that carries meaning meets 3:1, in both themes (tokens test).
Focus is a lilac ring and glow on everything keyboard-reachable (brass on vault surfaces). Landmarks and names: one `h1` per page,
named regions (each `BentoCard` is a region labelled by its title), a skip link in `AppShell`, `aria-current` for the current page.
Touch targets are at least 44px (`control-md`). Charts are `role="img"` with a spoken summary and a text list of every value, or
real text. Decorative layers are `aria-hidden`. The 390px layout has no horizontal page scroll.
