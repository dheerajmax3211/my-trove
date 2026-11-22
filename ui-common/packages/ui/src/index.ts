import './styles/base.css'

export {
  AppShell,
  SidebarCount,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  type AppShellProps,
  type SidebarLinkProps,
  type SidebarNavProps,
  type SidebarSectionProps,
} from './components/AppShell/AppShell'
export {
  Avatar,
  avatarProduct,
  initialsOf,
  type AvatarProps,
  type AvatarSize,
} from './components/Avatar/Avatar'
export { Badge, type BadgeProps, type BadgeVariant } from './components/Badge/Badge'
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from './components/Button/Button'
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  type CardProps,
  type CardTitleProps,
} from './components/Card/Card'
export { Callout, type CalloutProps, type CalloutVariant } from './components/Callout/Callout'
export { Checkbox, type CheckboxProps } from './components/Checkbox/Checkbox'
export {
  CommandPalette,
  scoreItem,
  type CommandItem,
  type CommandPaletteProps,
} from './components/CommandPalette/CommandPalette'
export {
  Container,
  type ContainerProps,
  type ContainerSize,
} from './components/Container/Container'
export {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
  type SortDirection,
  type SortState,
  type SortValue,
} from './components/DataTable/DataTable'
export { Dialog, DialogClose, type DialogProps } from './components/Dialog/Dialog'
export { EmptyState, type EmptyStateProps } from './components/EmptyState/EmptyState'
export {
  Illustration,
  IllustrationAllClear,
  IllustrationEmpty,
  IllustrationKey,
  IllustrationLetter,
  IllustrationLocked,
  IllustrationSearch,
  illustrations,
  type IllustrationName,
  type IllustrationProps,
  type NamedIllustrationProps,
} from './components/Illustration/Illustration'
export {
  Field,
  FieldError,
  Label,
  type FieldErrorProps,
  type FieldProps,
  type LabelProps,
} from './components/Field/Field'
export { IconButton, type IconButtonProps } from './components/IconButton/IconButton'
export { Input, type InputProps } from './components/Input/Input'
export {
  KeyValueList,
  type KeyValueItem,
  type KeyValueListProps,
} from './components/KeyValueList/KeyValueList'
export {
  Logo,
  type LogoProps,
  type LogoSize,
  type LogoTone,
  type LogoVariant,
} from './components/Logo/Logo'
export { PageHeader, type PageHeaderProps } from './components/PageHeader/PageHeader'
export {
  KeyCut,
  VaultRings,
  type KeyCutProps,
  type VaultRingsProps,
} from './components/Pattern/Pattern'
export {
  PersonaBadge,
  personas,
  type Persona,
  type PersonaBadgeProps,
} from './components/PersonaBadge/PersonaBadge'
export {
  ProductMark,
  type ProductMarkId,
  type ProductMarkProps,
  type ProductMarkVariant,
} from './components/ProductMark/ProductMark'
export {
  Section,
  SectionHeader,
  type SectionHeaderProps,
  type SectionPattern,
  type SectionProps,
  type SectionSize,
  type SectionTone,
} from './components/Section/Section'
export { Select, type SelectProps } from './components/Select/Select'
export { Skeleton, type SkeletonProps } from './components/Skeleton/Skeleton'
export {
  Sparkline,
  sparklinePoints,
  type SparklineProps,
  type SparklineTone,
} from './components/Sparkline/Sparkline'
export { Spinner, type SpinnerProps } from './components/Spinner/Spinner'
export { Stat, type StatProps, type StatTrend } from './components/Stat/Stat'
export { Stepper, type StepperProps, type StepperStep } from './components/Stepper/Stepper'
export { Switch, type SwitchProps } from './components/Switch/Switch'
export { Tabs, TabsContent, TabsList, TabsTrigger } from './components/Tabs/Tabs'
export {
  ThemeProvider,
  useTheme,
  type ThemePreference,
  type ThemeProviderProps,
} from './components/ThemeProvider/ThemeProvider'
export { Textarea, type TextareaProps } from './components/Textarea/Textarea'
export {
  ToastProvider,
  useToast,
  type ToastOptions,
  type ToastProviderProps,
  type ToastVariant,
} from './components/Toast/Toast'
export {
  Timeline,
  type TimelineItem,
  type TimelineProps,
  type TimelineTone,
} from './components/Timeline/Timeline'
export { Tooltip, TooltipProvider, type TooltipProps } from './components/Tooltip/Tooltip'
export {
  VisuallyHidden,
  type VisuallyHiddenProps,
} from './components/VisuallyHidden/VisuallyHidden'
export {
  PortalContainerProvider,
  usePortalContainer,
  type PortalContainerProviderProps,
} from './internal/portal'
export { cx } from './internal/cx'
export { useHotkey, type HotkeyOptions } from './internal/use-hotkey'
export { useReducedMotion } from './internal/use-reduced-motion'
export * from './internal/icons'

// ---- motion primitives ----
export { useInView, type UseInViewOptions } from './motion/use-in-view'
export {
  Reveal,
  Stagger,
  type RevealDirection,
  type RevealOptions,
  type RevealProps,
  type StaggerProps,
} from './motion/Reveal'
export { CountUp, type CountUpProps } from './motion/CountUp'
export { Parallax, type ParallaxProps } from './motion/Parallax'
export { SpotlightCard, type SpotlightCardProps } from './motion/SpotlightCard'
export { Magnetic, type MagneticProps } from './motion/Magnetic'
export { PageTransition, type PageTransitionProps } from './motion/PageTransition'
export { ScrollProgress, type ScrollProgressProps } from './motion/ScrollProgress'
export { SplitText, type SplitTextProps } from './motion/SplitText'
export { Marquee, type MarqueeProps } from './motion/Marquee'
export {
  SmoothScroll,
  useScrollSmooth,
  type SmoothScrollProps,
  type SmoothScrollValue,
} from './motion/SmoothScroll'
export {
  loadScrollStory,
  useScrollStory,
  type ScrollStoryContext,
  type ScrollStoryKit,
} from './motion/scroll-story'
export {
  IndicatorGroup,
  LayoutIndicator,
  type LayoutIndicatorProps,
} from './motion/LayoutIndicator'
export {
  AnimatedList,
  AnimatedListItem,
  type AnimatedListItemProps,
  type AnimatedListProps,
} from './motion/AnimatedList'

// ---- backgrounds and surfaces ----
export {
  Aurora,
  type AuroraIntensity,
  type AuroraPalette,
  type AuroraProps,
} from './surfaces/Aurora'
export { GridGlow, type GridGlowProps } from './surfaces/GridGlow'
export { Grain, type GrainProps } from './surfaces/Grain'
export { GlassPanel, type GlassPanelProps } from './surfaces/GlassPanel'
export { GradientBorder, type GradientBorderProps } from './surfaces/GradientBorder'

// ---- forms ----
export {
  Form,
  FormActions,
  FormGrid,
  FormSection,
  type FormActionsProps,
  type FormGridProps,
  type FormProps,
  type FormSectionProps,
} from './forms/Form'
export { FileDrop, type FileDropProps } from './forms/FileDrop'

// ---- charts ----
export { AreaChart, smoothPath, type AreaChartProps, type AreaPoint } from './charts/AreaChart'
export { BarList, type BarListItem, type BarListProps } from './charts/BarList'
export { Donut, type DonutProps, type DonutSegment } from './charts/Donut'
export { type ChartTone } from './charts/tone'

// ---- dashboard kit ----
export {
  AppFrame,
  SearchPill,
  UserChip,
  type AppFrameProps,
  type SearchPillProps,
  type UserChipProps,
} from './dashboard/AppFrame'
export {
  BentoCard,
  BentoGrid,
  type BentoCardProps,
  type BentoGridProps,
  type BentoTone,
} from './dashboard/Bento'
export { BigStat, type BigStatProps, type BigStatSecondary } from './dashboard/BigStat'
export { BubbleChart, type Bubble, type BubbleChartProps } from './dashboard/BubbleChart'
export { DotMatrix, type DotMatrixColumn, type DotMatrixProps } from './dashboard/DotMatrix'
export { BarsChart, type BarsChartProps, type BarsDatum } from './dashboard/BarsChart'
export { ProgressStat, type DashTone, type ProgressStatProps } from './dashboard/ProgressStat'
export { PromoCard, PromoOrb, type PromoCardProps } from './dashboard/PromoCard'
export { PillSelect, type PillSelectOption, type PillSelectProps } from './dashboard/PillSelect'
export { RoundIconButton, type RoundIconButtonProps } from './dashboard/RoundIconButton'
