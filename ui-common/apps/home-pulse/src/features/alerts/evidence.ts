import { formatDate, formatDateTime, formatDuration, formatWatts } from '../../lib/format'
import type { AlertDto, AlertKind, AlertStatus, Severity } from './types'

export const KIND_LABELS: Record<AlertKind, string> = {
  POWER_SHIFT: 'Power draw changed',
  DUTY_CYCLE_DRIFT: 'Running pattern changed',
  STUCK_ON: 'Stuck on',
  STOPPED: 'Stopped cycling',
  NO_DATA: 'No data',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  INFO: 'Info',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
}

export const STATUS_LABELS: Record<AlertStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved',
}

/** One sentence on which model raised the alert, for the alert detail. */
export function decidedByLine(alert: Pick<AlertDto, 'decidedBy'>): string {
  return alert.decidedBy === 'ML'
    ? 'Detected by the learned model, which compares each hour with what is normal for that time of day.'
    : 'Detected by the built-in rules, which compare the last day with the learned normal.'
}

export interface AlertExplanation {
  /** One sentence: what changed, in everyday words. */
  headline: string
  /** The numbers behind it. */
  facts: string[]
  /** What to do about it. */
  suggestion: string
}

type Evidence = Record<string, unknown>

const num = (evidence: Evidence, key: string): number | undefined => {
  const value = evidence[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const when = (evidence: Evidence, key: string): string | undefined => {
  const value = evidence[key]
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined
}

const pct = (value: number): string => `${Math.round(Math.abs(value))}%`

const rel = (current: number, baseline: number): number => ((current - baseline) / baseline) * 100

const periodLength = (hours: number | undefined): string =>
  hours === undefined
    ? ''
    : ` of ${hours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hours each`

/**
 * Turns the detector's evidence (a flat JSON map whose keys depend on the alert kind) into sentences.
 * When the evidence is missing or malformed it falls back to the message the service wrote itself, so an
 * alert is never shown empty.
 */
export function describeAlert(
  alert: Pick<AlertDto, 'kind' | 'applianceName' | 'message' | 'evidence'>,
): AlertExplanation {
  const { applianceName: name, evidence: ev } = alert
  const fallback = (suggestion: string): AlertExplanation => ({
    headline: alert.message || `${name} needs attention.`,
    facts: [],
    suggestion,
  })

  switch (alert.kind) {
    case 'POWER_SHIFT': {
      const baseline = num(ev, 'baselineWatts')
      const current = num(ev, 'currentWatts')
      if (baseline === undefined || current === undefined || baseline === 0)
        return fallback('Check the appliance, and book a service if the change continues.')
      const change = num(ev, 'changePct') ?? rel(current, baseline)
      const higher = change > 0
      const windows = num(ev, 'windowsDeviating')
      const sustained = num(ev, 'hoursSustained')
      return {
        headline: `${name} draws ${pct(change)} ${higher ? 'more' : 'less'} power than its normal while running.`,
        facts: [
          `Normal running power: ${formatWatts(baseline)}. Recently: ${formatWatts(current)}.`,
          ...(windows !== undefined
            ? [
                `Seen in ${windows} of the last 4 comparison periods${periodLength(num(ev, 'windowHours'))}, so it is not a one-off.`,
              ]
            : sustained !== undefined
              ? [
                  `Seen in each of the last ${sustained} hours, compared with what is normal at this time of day.`,
                ]
              : []),
        ],
        suggestion: higher
          ? 'A rising draw is often an early sign of wear. Check ventilation, coils and filters, and book a service if it keeps climbing.'
          : 'A falling draw can mean the appliance is doing less work than it should. Check that it still does its job.',
      }
    }

    case 'DUTY_CYCLE_DRIFT': {
      const baseDuty = num(ev, 'baselineDutyPct')
      const curDuty = num(ev, 'currentDutyPct')
      const baseCycle = num(ev, 'baselineCycleMinutes')
      const curCycle = num(ev, 'currentCycleMinutes')
      const dutyKnown = baseDuty !== undefined && curDuty !== undefined && baseDuty > 0
      const cycleKnown = baseCycle !== undefined && curCycle !== undefined && baseCycle > 0
      if (!dutyKnown && !cycleKnown)
        return fallback('Check door seals, vents and filters, and book a service if it continues.')
      const facts: string[] = []
      if (dutyKnown)
        facts.push(`It ran ${pct(curDuty)} of the time. Normally it runs ${pct(baseDuty)}.`)
      if (cycleKnown)
        facts.push(
          `Each run lasted ${formatDuration(curCycle)}. Normally a run lasts ${formatDuration(baseCycle)}.`,
        )
      const headline = dutyKnown
        ? `${name} runs ${pct(rel(curDuty, baseDuty))} ${curDuty > baseDuty ? 'more' : 'less'} of the time than normal.`
        : `${name} runs ${pct(rel(curCycle as number, baseCycle as number))} ${(curCycle as number) > (baseCycle as number) ? 'longer' : 'shorter'} per cycle than normal.`
      return {
        headline,
        facts,
        suggestion:
          'Longer or more frequent running can point to a worn door seal, a dirty coil or a refrigerant leak. Check seals and filters, and book a service if it continues.',
      }
    }

    case 'STUCK_ON':
    case 'STOPPED': {
      const stuck = alert.kind === 'STUCK_ON'
      const run = num(ev, 'runMinutes')
      if (run === undefined)
        return fallback(
          stuck
            ? 'Check whether it is meant to be on.'
            : 'Check that it is plugged in and working.',
        )
      const normal = num(ev, 'longestNormalRunMinutes')
      const since = when(ev, 'since')
      return {
        headline: stuck
          ? `${name} has been running non-stop for ${formatDuration(run)}.`
          : `${name} has not switched on for ${formatDuration(run)}, although it normally cycles.`,
        facts: [
          ...(normal !== undefined
            ? [
                `The longest ${stuck ? 'run' : 'pause'} it normally has is ${formatDuration(normal)}.`,
              ]
            : []),
          ...(since ? [`${stuck ? 'Running' : 'Idle'} since ${formatDateTime(since)}.`] : []),
        ],
        suggestion: stuck
          ? 'Check whether it is meant to be on. If it should have switched off, a stuck thermostat, float or relay may be the cause.'
          : 'It may be switched off, unplugged or have failed. Check that it has power and is doing its job.',
      }
    }

    case 'NO_DATA': {
      const silent = num(ev, 'silentMinutes')
      const last = when(ev, 'lastSeen')
      const limit = num(ev, 'thresholdMinutes')
      const suggestion =
        'Check that the plug is powered and connected to Wi-Fi. If you replaced it, register the new device.'
      const threshold =
        limit !== undefined ? [`An alert is raised after ${formatDuration(limit)} of silence.`] : []
      if (silent === undefined && !last)
        return {
          headline: `The sensor on ${name} has never reported a reading.`,
          facts: threshold,
          suggestion,
        }
      return {
        headline: `No readings from ${name} for ${formatDuration(silent ?? 0)}.`,
        facts: [...(last ? [`Last reading: ${formatDateTime(last)}.`] : []), ...threshold],
        suggestion,
      }
    }
  }
}

/** Warranty and service lines that tell the owner why acting now matters. Empty when nothing applies. */
export function alertContext(
  alert: Pick<
    AlertDto,
    | 'underWarranty'
    | 'warrantyEndDate'
    | 'daysToWarrantyEnd'
    | 'serviceOverdue'
    | 'nextServiceDate'
    | 'status'
  >,
): string[] {
  const lines: string[] = []
  if (alert.status !== 'RESOLVED' && alert.underWarranty && alert.warrantyEndDate) {
    const days = alert.daysToWarrantyEnd
    lines.push(
      `Still under warranty until ${formatDate(alert.warrantyEndDate)}${days !== null && days >= 0 ? ` (${days} ${days === 1 ? 'day' : 'days'} left)` : ''}. Get it checked before the warranty ends.`,
    )
  }
  if (alert.serviceOverdue && alert.nextServiceDate)
    lines.push(`Its service was due on ${formatDate(alert.nextServiceDate)}.`)
  return lines
}
