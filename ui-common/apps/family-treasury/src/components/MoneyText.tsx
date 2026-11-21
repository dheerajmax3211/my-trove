import { formatMinor, formatSigned } from '../lib/money'

export interface MoneyTextProps {
  minor: number
  currency: string
  /** Show an explicit + or - sign (statements, postings). */
  signed?: boolean
}

/** Currency amount with tabular figures, so columns of money line up. */
export function MoneyText({ minor, currency, signed = false }: MoneyTextProps) {
  const text = signed ? formatSigned(minor, currency) : formatMinor(minor, currency)
  return <span className={minor < 0 ? 'ft-money ft-negative' : 'ft-money'}>{text}</span>
}
