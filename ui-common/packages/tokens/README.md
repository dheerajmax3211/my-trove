# @platform/tokens

Design tokens for the platform: typed TypeScript objects plus generated CSS custom properties.

**Identity: "paper & verdigris".** Warm paper surfaces (`#F6F2EA`), near-black green ink, a deep verdigris
accent (`#0E5C52`) and a burnt-orange focus ring; the dark theme is a deep green-black with a mint accent.
Headings use a system old-style serif stack for character without webfonts; body text is the system sans.

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
`--pp-text-<style>-<size|line|weight|tracking|family>`, `--pp-shadow-<sm|md|lg|xl>`,
`--pp-duration-<name>`, `--pp-ease-<name>`, `--pp-z-<layer>`, `--pp-control-<sm|md|lg>`.

## Use in TypeScript

```ts
import { themes, spacing, textStyles, vars, contrastRatio } from '@platform/tokens'

themes.dark.colors.accent // '#5FC9B5'
vars.color.surface // 'var(--pp-color-surface)'  (typed references for inline styles)
```

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
system stacks on web; in React Native map `fontFamily` to the platform fonts you ship.
