# @platform/tokens

Design tokens for the platform: typed TypeScript objects plus generated CSS custom properties.

**Identity: "a vault you can lend from", v3.** A soft grey canvas with white cards, a black action colour (lime on dark), lime
and lilac highlights, a rare brass, a near-black "vault" surface that stays dark in both themes, and one accent per product
(six). New in v3: gradient, glow, blur and spring tokens. The app face is Plus Jakarta Sans, the public site's headlines are Young Serif, code is JetBrains Mono, all self-hosted
by `@platform/ui` through `@fontsource` packages. The full decisions are in [`docs/design/brand.md`](../../../docs/design/brand.md).

## Use in CSS

```css
@import '@platform/tokens/css'; /* or import '@platform/ui/styles.css', which already includes it */

.card {
  background: var(--pp-color-surface);
  color: var(--pp-color-text);
  border-radius: var(--pp-radius-lg);
  padding: var(--pp-space-4);
  box-shadow: var(--pp-shadow-md);
}
```

Names: `--pp-color-<role>`, `--pp-space-<n>`, `--pp-radius-<name>`, `--pp-font-<family>`,
`--pp-text-<style>-<size|line|weight|tracking|family>`, `--pp-shadow-<xs|sm|md|lg|xl|inset>`, `--pp-layout-<narrow|content|wide>`, `--pp-texture-<grain|ledger>`,
`--pp-duration-<name>`, `--pp-ease-<name>`, `--pp-z-<layer>`, `--pp-control-<sm|md|lg>`.

## Use in TypeScript

```ts
import { themes, spacing, textStyles, vars, contrastRatio } from '@platform/tokens'

themes.dark.colors.accent // '#5FC9B5'
vars.color.surface // 'var(--pp-color-surface)'  (typed references for inline styles)
```

## Product accents and the vault surface

```html
<div data-product="waiting-on">...</div>
<!-- every --pp-color-accent* inside becomes the product's accent -->
<section data-surface="vault">...</section>
<!-- text, surface, accent, border roles remap to the dark vault palette -->
```

Outside a wrapper, `productVar('consent', 'text')` returns `var(--pp-color-product-consent-text)`. Roles per product:
accent, hover, active, subtle, text, on. Display text styles (`hero`, `displayLg`, `display`, `h1`, `lead`, `stat`) are fluid
between a 375px and a 1280px viewport.

## Themes

- No `data-theme` attribute: follows `prefers-color-scheme`.
- `data-theme="light" | "dark"` on `<html>` (or any element): forces that theme for the element's subtree.
- Generated CSS is committed as `tokens.css`; a unit test fails if it is stale. Regenerate with
  `pnpm tokens:generate` after editing `src/*.ts`.
- All durations collapse to ~0ms under `prefers-reduced-motion`.

## Accessibility is tested, not asserted

`src/tokens.test.ts` checks every semantic text/background pair for both themes against WCAG 2.x AA
(4.5:1 for text such as `textSubtle` on `canvas`, `onAccent` on `accent`, `dangerText` on `dangerSubtle`,
and so on) and 3:1 for non-text UI graphics (`borderStrong`, `focusRing`, `accent`), using the same
`contrastRatio()` helper this package exports. Add a role, add a pair to that test.

## Platform-neutral on purpose (React Native / Expo)

Nothing in the TS API depends on the DOM or on CSS:

| Token   | Representation                                                                    |
| ------- | --------------------------------------------------------------------------------- |
| colors  | 6/8-digit hex strings (parseable everywhere; `scrim` includes alpha)              |
| spacing | numbers in px on a 4px grid                                                       |
| radius  | numbers in px                                                                     |
| text    | `{ family, size, lineHeight, weight, tracking }` with absolute px line heights    |
| shadows | arrays of `{ x, y, blur, spread, color, opacity }` layers (CSS string is derived) |
| motion  | durations in ms, easings as `[x1, y1, x2, y2]` bezier control points              |

An Expo app imports the same objects and maps them to `StyleSheet` values (pick `themes.light` or
`themes.dark` from `useColorScheme()`); only `tokens.css` and `vars` are web-specific. Font families are
CSS stacks on web; in React Native map `fontFamily` to the fonts you ship (Plus Jakarta Sans, Young Serif, JetBrains Mono).
