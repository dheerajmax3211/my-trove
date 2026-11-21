import { createContext, useContext, type ReactNode } from 'react'

export interface AppSettings {
  /** How often (ms) to re-check documents that are still being indexed. */
  pollIntervalMs: number
}

export const DEFAULT_SETTINGS: AppSettings = { pollIntervalMs: 1500 }

const SettingsContext = createContext<AppSettings>(DEFAULT_SETTINGS)

export function SettingsProvider({ value, children }: { value: AppSettings; children: ReactNode }) {
  return <SettingsContext value={value}>{children}</SettingsContext>
}

export function useSettings(): AppSettings {
  return useContext(SettingsContext)
}
