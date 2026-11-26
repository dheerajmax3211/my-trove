import { createApiClient, type ApiError } from '@platform/api-client'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { appliancesApi } from '../features/appliances/api'
import { devicesApi } from '../features/devices/api'
import { readingsApi } from '../features/readings/api'
import { simulationApi } from '../features/simulation/api'
import {
  esp32Snippet,
  curlSnippet,
  homeAssistantSnippet,
  ingestUrl,
} from '../features/devices/snippets'
import { gatewayIngestBaseUrl } from '../lib/ingest'
import { createMockApi } from '../mock/mockApi'
import { renderApp } from '../test/setup'

const NOW = new Date('2026-11-19T12:00:00.000Z')
const WASHER = '00000000-0000-4000-8000-000000000004'
const FRIDGE = '00000000-0000-4000-8000-000000000001'

function api() {
  const mock = createMockApi({ clock: () => new Date(NOW) })
  const client = createApiClient({ baseUrl: '/api', getToken: () => 'tok', fetch: mock.fetch })
  return { client, mock }
}

describe('mock simulation endpoint', () => {
  it('fills a week of readings, learns the baseline and flags the device as simulated', async () => {
    const { client } = api()
    const result = await simulationApi(client).start(WASHER, { days: 7, scenario: 'NORMAL' })
    expect(result).toEqual({
      readingsInserted: 7 * 288,
      baselineStatus: 'READY',
      alertOpened: false,
    })
    const health = await appliancesApi(client).health(WASHER)
    expect(health.simulated).toBe(true)
    expect(health.status).toBe('HEALTHY')
    const [device] = await devicesApi(client).list(WASHER)
    expect(device).toMatchObject({ label: 'Built-in simulator', simulated: true, active: true })
    const series = await readingsApi(client).series(WASHER, {
      from: new Date(NOW.getTime() - 24 * 3_600_000),
      to: NOW,
    })
    expect(series.simulated).toBe(true)
    expect(series.points.length).toBeGreaterThan(0)
  })

  it('opens an alert for the ANOMALY scenario and cleans up on DELETE', async () => {
    const { client } = api()
    const result = await simulationApi(client).start(WASHER, { days: 7, scenario: 'ANOMALY' })
    expect(result.alertOpened).toBe(true)
    expect((await appliancesApi(client).health(WASHER)).activeAlerts).toHaveLength(1)
    await simulationApi(client).stop(WASHER)
    const health = await appliancesApi(client).health(WASHER)
    expect(health.status).toBe('NO_DEVICE')
    expect(health.activeAlerts).toHaveLength(0)
    expect(await devicesApi(client).list(WASHER)).toHaveLength(0)
  })

  it('refuses when the appliance has a real device, and validates the request', async () => {
    const { client } = api()
    const conflict = (await simulationApi(client)
      .start(FRIDGE, { days: 7, scenario: 'NORMAL' })
      .catch((e: unknown) => e)) as ApiError
    expect(conflict.status).toBe(409)
    const bad = (await simulationApi(client)
      .start(WASHER, { days: 30, scenario: 'NORMAL' })
      .catch((e: unknown) => e)) as ApiError
    expect(bad.status).toBe(400)
  })
})

describe('ingest snippets', () => {
  const input = {
    baseUrl: 'http://localhost:8080/api/home-pulse/',
    token: 'hpd_abc',
    deviceId: 'dev-1',
    now: NOW,
  }
  it('use the real ingest address and never a placeholder host', () => {
    expect(ingestUrl(input.baseUrl)).toBe('http://localhost:8080/api/home-pulse/v1/ingest/readings')
    for (const snippet of [curlSnippet(input), esp32Snippet(input), homeAssistantSnippet(input)]) {
      expect(snippet).toContain('http://localhost:8080/api/home-pulse/v1/ingest/readings')
      expect(snippet).toContain('hpd_abc')
      expect(snippet).not.toContain('example')
    }
  })
})

describe('ingest base url', () => {
  it('is the configured gateway, or the local development gateway', () => {
    expect(gatewayIngestBaseUrl('https://gw.example/api/')).toBe(
      'https://gw.example/api/home-pulse',
    )
    expect(gatewayIngestBaseUrl(undefined)).toBe('http://localhost:8080/api/home-pulse')
  })
})

describe('simulating a plug in the UI', () => {
  it('explains where data comes from, simulates a plug, adds a spike and removes it', async () => {
    const { user } = await renderApp({ path: `/appliances/${WASHER}` })
    expect(
      await screen.findByRole('heading', { name: 'Where does this data come from?' }),
    ).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'No hardware? Simulate a plug' }))
    const card = (await screen.findByRole('heading', { name: 'Simulated plug' })).closest(
      'section, article, div',
    ) as HTMLElement
    expect(card).toBeTruthy()
    expect((await screen.findAllByText('Simulated')).length).toBeGreaterThan(1)

    await user.click(await screen.findByRole('button', { name: 'Add a spike' }))
    expect(await screen.findByText('Spike added: an alert opened')).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Active alerts' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove the simulation' }))
    expect(await screen.findByText('Simulation removed')).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'No hardware? Simulate a plug' }),
    ).toBeInTheDocument()
    expect(within(document.body).queryByRole('heading', { name: 'Simulated plug' })).toBeNull()
  })
})
