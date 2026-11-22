import {
  Badge,
  BentoCard,
  BentoGrid,
  BigStat,
  BoltIcon,
  Button,
  Callout,
  DataTable,
  Illustration,
  EmptyState,
  PageHeader,
  PlusIcon,
  Skeleton,
  useToast,
  type DataTableColumn,
} from '@platform/ui'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ModuleLink } from '@platform/workspace-kit'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ErrorState } from '../../../components/ErrorState'
import { useClock } from '../../../lib/clock'
import { errorMessage } from '../../../lib/errors'
import { formatDateTime, formatRelative } from '../../../lib/format'
import { useDocumentTitle } from '../../../lib/useDocumentTitle'
import { useAppliances } from '../../appliances/hooks'
import { PlugIcon } from '../../../lib/icons'
import { RegisterDeviceDialog } from '../components/RegisterDeviceDialog'
import { TokenDialog } from '../components/TokenDialog'
import { useDevicesFor, useRevokeDevice } from '../hooks'
import type { DeviceDto, RegisteredDevice } from '../types'

interface DeviceRow extends DeviceDto {
  applianceName: string
}

export function DevicesPage() {
  useDocumentTitle('Devices')
  const clock = useClock()
  const { toast } = useToast()
  const [params] = useSearchParams()
  const preselected = params.get('appliance') ?? undefined

  const appliances = useAppliances()
  const applianceList = useMemo(() => appliances.data ?? [], [appliances.data])
  const deviceQueries = useDevicesFor(applianceList.map((a) => a.id))
  const revoke = useRevokeDevice()

  const [registering, setRegistering] = useState(Boolean(preselected))
  const [registered, setRegistered] = useState<RegisteredDevice | null>(null)
  const [revoking, setRevoking] = useState<DeviceRow | null>(null)

  const rows: DeviceRow[] = applianceList.flatMap((appliance, i) =>
    (deviceQueries[i]?.data ?? []).map((device) => ({ ...device, applianceName: appliance.name })),
  )
  const occupied = new Set(rows.filter((d) => d.active).map((d) => d.applianceId))
  const waiting = rows.filter((d) => d.active && d.lastSeenAt === null)
  const devicesLoading = deviceQueries.some((q) => q.isPending)
  const devicesError = deviceQueries.find((q) => q.isError)

  const columns: DataTableColumn<DeviceRow>[] = [
    {
      id: 'label',
      header: 'Device',
      sortValue: (d) => d.label,
      cell: (d) => <strong>{d.label}</strong>,
    },
    {
      id: 'appliance',
      header: 'Appliance',
      sortValue: (d) => d.applianceName,
      cell: (d) => <ModuleLink to={`/appliances/${d.applianceId}`}>{d.applianceName}</ModuleLink>,
    },
    {
      id: 'token',
      header: 'Token',
      headerLabel: 'Token',
      cell: (d) => <code>{d.tokenPrefix}...</code>,
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (d) => (d.active ? 0 : 1),
      cell: (d) =>
        d.active ? (
          <Badge variant="success" dot>
            Active
          </Badge>
        ) : (
          <Badge variant="neutral">Revoked</Badge>
        ),
    },
    {
      id: 'lastSeen',
      header: 'Last seen',
      sortValue: (d) => (d.lastSeenAt ? new Date(d.lastSeenAt) : null),
      cell: (d) => formatRelative(d.lastSeenAt, clock()),
    },
    {
      id: 'registered',
      header: 'Registered',
      sortValue: (d) => new Date(d.createdAt),
      cell: (d) => formatDateTime(d.createdAt),
    },
    {
      id: 'actions',
      header: <span className="hp-sr-only">Actions</span>,
      headerLabel: 'Actions',
      align: 'end',
      cell: (d) =>
        d.active ? (
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Revoke ${d.label}`}
            onClick={() => setRevoking(d)}
          >
            Revoke
          </Button>
        ) : null,
    },
  ]

  const confirmRevoke = () => {
    if (!revoking) return
    revoke.mutate(revoking.id, {
      onSuccess: () => {
        toast({
          title: 'Device revoked',
          description: `${revoking.label} can no longer send readings. Register a new device to replace it.`,
          variant: 'success',
        })
        setRevoking(null)
        revoke.reset()
      },
    })
  }

  let body
  if (appliances.isPending) body = <Skeleton height="12rem" />
  else if (appliances.isError)
    body = (
      <ErrorState
        title="Could not load your appliances"
        error={appliances.error}
        onRetry={() => void appliances.refetch()}
      />
    )
  else if (applianceList.length === 0)
    body = (
      <EmptyState
        illustration={<Illustration name="empty" />}
        title="Add an appliance first"
        description="A device always belongs to an appliance. Add the appliance, then come back to register its smart plug or sensor."
        action={
          <Button asChild>
            <ModuleLink to="/appliances/new">Add an appliance</ModuleLink>
          </Button>
        }
      />
    )
  else if (devicesError)
    body = (
      <ErrorState
        title="Could not load devices"
        error={devicesError.error}
        onRetry={() => deviceQueries.forEach((q) => void q.refetch())}
      />
    )
  else
    body = (
      <BentoGrid>
        <BentoCard span={4} tone="dark" title="Reporting" icon={<PlugIcon size={18} />}>
          <BigStat
            value={rows.filter((d) => d.active && d.lastSeenAt !== null).length}
            unit={`of ${rows.filter((d) => d.active).length} active`}
            trend={waiting.length === 0 ? 'up' : 'flat'}
            delta={waiting.length === 0 ? 'All sending' : `${waiting.length} waiting`}
            caption="Devices that have sent a reading."
          />
        </BentoCard>
        <BentoCard span={8} title="Appliances with a device" icon={<BoltIcon size={18} />}>
          <BigStat
            size="md"
            value={occupied.size}
            unit={`of ${applianceList.length} appliances`}
            caption="Each appliance has at most one active device."
          />
        </BentoCard>
        {waiting.length > 0 ? (
          <div className="hp-span-12 hp-stack-3">
            {waiting.map((d) => (
              <Callout key={d.id} variant="info" title={`${d.label} has not sent a reading yet`}>
                Power up the plug and check it is online. The first reading usually arrives within a
                minute. About a week after that, Home Pulse has learned what normal looks like for{' '}
                {d.applianceName}.
              </Callout>
            ))}
          </div>
        ) : null}
        <section className="hp-span-12 hp-table-card" aria-label="All devices">
          {/* Scrollable region: keyboard focusable so the wide table can be reached on a phone (WCAG 2.1.1). */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className="hp-table-scroll" role="region" aria-label="Devices table" tabIndex={0}>
            <DataTable
              caption="Devices"
              columns={columns}
              data={rows}
              getRowId={(d) => d.id}
              loading={devicesLoading}
              defaultSort={{ columnId: 'status', direction: 'asc' }}
              emptyState={
                <EmptyState
                  headingAs="h2"
                  illustration={<Illustration name="key" size={180} />}
                  title="No devices yet"
                  description="Register the smart plug or sensor that measures an appliance. We will show you a one-time token to put on it."
                  action={<Button onClick={() => setRegistering(true)}>Register a device</Button>}
                />
              }
            />
          </div>
        </section>
      </BentoGrid>
    )

  return (
    <>
      <PageHeader
        title="Devices"
        description="The smart plugs and sensors that report power readings. Each appliance has at most one active device."
        actions={
          applianceList.length > 0 ? (
            <Button leftIcon={<PlusIcon size={18} />} onClick={() => setRegistering(true)}>
              Register device
            </Button>
          ) : null
        }
      />
      {body}

      <RegisterDeviceDialog
        key={registering ? 'open' : 'closed'}
        open={registering}
        onOpenChange={setRegistering}
        appliances={applianceList}
        occupied={occupied}
        {...(preselected ? { defaultApplianceId: preselected } : {})}
        onRegistered={setRegistered}
      />
      <TokenDialog
        registered={registered}
        applianceName={
          applianceList.find((a) => a.id === registered?.device.applianceId)?.name ??
          'your appliance'
        }
        onDone={() => setRegistered(null)}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevoking(null)
            revoke.reset()
          }
        }}
        title={`Revoke ${revoking?.label ?? 'device'}?`}
        description="The device stops being accepted immediately. Readings it already sent are kept. To replace it, register a new device afterwards."
        confirmLabel="Revoke device"
        busy={revoke.isPending}
        error={revoke.error ? errorMessage(revoke.error) : null}
        onConfirm={confirmRevoke}
      />
    </>
  )
}
