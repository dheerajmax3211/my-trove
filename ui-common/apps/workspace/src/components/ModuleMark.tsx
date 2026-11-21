import { ProductMark, type ProductMarkId, type ProductMarkProps } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'

const KNOWN: ReadonlySet<string> = new Set<ProductMarkId>([
  'waiting-on',
  'consent',
  'home-pulse',
  'ask-your-life',
  'digital-legacy',
  'family-treasury',
  'core',
  'admin',
])

type Props = Omit<ProductMarkProps, 'product'> & { module: Pick<ProductModule, 'id' | 'icon'> }

/**
 * The module's mark. The design system draws the eight known ids; a module it has never heard of
 * (a new product, a test double) gets its own `icon` in a neutral tile instead of crashing.
 */
export function ModuleMark({ module, size = 40, variant = 'tile', title, ...rest }: Props) {
  if (KNOWN.has(module.id)) {
    return (
      <ProductMark
        product={module.id as ProductMarkId}
        size={size}
        variant={variant}
        {...(title ? { title } : {})}
        {...rest}
      />
    )
  }
  const Icon = module.icon
  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: size,
        height: size,
        flex: 'none',
        borderRadius: 'var(--pp-radius-md)',
        background: 'var(--pp-color-accent-subtle)',
        color: 'var(--pp-color-accent-text)',
      }}
    >
      <Icon size={Math.round(size * 0.55)} />
    </span>
  )
}
