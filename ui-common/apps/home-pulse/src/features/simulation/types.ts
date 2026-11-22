/** Mirrors the simulation endpoints: `POST` and `DELETE /v1/appliances/{id}/simulation`. */
export type SimulationScenario = 'NORMAL' | 'ANOMALY'

export interface SimulationRequest {
  /** 1 to 14. A week is what the baseline needs. */
  days: number
  scenario: SimulationScenario
}

export interface SimulationResult {
  readingsInserted: number
  baselineStatus: string
  alertOpened: boolean
}
