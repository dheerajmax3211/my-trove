import { BentoCard, BoltIcon, Button, Field, Input, Textarea, useToast } from '@platform/ui'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { errorMessage } from '../../../lib/errors'
import type { Slot } from '../../appliances/components/slot'
import { useRevokeDevice } from '../../devices/hooks'
import { describeImport, describeMeterResult } from '../copy'
import { useImportCsv, useRecordMeterTotal } from '../hooks'
import type { MeterReadingInput } from '../types'

/** Enough for 10,000 rows of a timestamp and watts. Bigger exports are split by the owner. */
const MAX_FILE_BYTES = 1_000_000

export interface ManualReadingsCardProps extends Slot {
  applianceId: string
  applianceName: string
  /** The live manual device, when entries already exist. Stopping revokes it; its history stays. */
  manualDeviceId?: string | null
}

/**
 * Readings without hardware: the meter total the owner reads now, or a CSV export. Both feed the same manual device,
 * so everything this card makes is labelled "Entered by you" wherever it shows up.
 */
export function ManualReadingsCard({
  applianceId,
  applianceName,
  manualDeviceId = null,
  className,
  style,
}: ManualReadingsCardProps) {
  const { toast } = useToast()
  const record = useRecordMeterTotal(applianceId)
  const importRows = useImportCsv(applianceId)
  const stop = useRevokeDevice()
  const [confirmStop, setConfirmStop] = useState(false)

  const [kwh, setKwh] = useState('')
  const [readAt, setReadAt] = useState('')
  const [kwhError, setKwhError] = useState<string | null>(null)
  const [meterNote, setMeterNote] = useState<string | null>(null)

  const [csv, setCsv] = useState('')
  const [csvError, setCsvError] = useState<string | null>(null)
  const [csvNote, setCsvNote] = useState<string | null>(null)

  const submitMeter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = Number(kwh)
    if (kwh.trim() === '' || !Number.isFinite(value) || value < 0) {
      setKwhError('Enter the total from the meter in kWh, for example 1234.56.')
      return
    }
    setKwhError(null)
    setMeterNote(null)
    const input: MeterReadingInput = { kwh: value }
    if (readAt) input.at = new Date(readAt).toISOString()
    record.mutate(input, {
      onSuccess: (result) => {
        setMeterNote(describeMeterResult(result))
        setKwh('')
        setReadAt('')
      },
    })
  }

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setCsvError('That file is too large. Export it in parts of up to 10,000 readings.')
      return
    }
    void file.text().then((text) => {
      setCsvError(null)
      setCsv(text)
    })
  }

  const submitCsv = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (csv.trim() === '') {
      setCsvError('Paste the rows, or choose a CSV file first.')
      return
    }
    setCsvError(null)
    setCsvNote(null)
    importRows.mutate(csv, {
      onSuccess: (result) => {
        setCsvNote(describeImport(result))
        setCsv('')
      },
    })
  }

  const onStop = () => {
    if (!manualDeviceId) return
    stop.mutate(manualDeviceId, {
      onSuccess: () => {
        setConfirmStop(false)
        toast({
          title: 'Stopped entering readings',
          description: 'Earlier entries stay in the history. You can connect a smart plug now.',
          variant: 'success',
        })
      },
    })
  }

  return (
    <BentoCard
      span={12}
      title="Enter readings yourself"
      icon={<BoltIcon size={18} />}
      {...(className ? { className } : {})}
      {...(style ? { style } : {})}
    >
      <div className="hp-stack-4">
        <p className="hp-small">
          No smart plug? Type in the total that your plug&apos;s display or your meter shows, or
          import a CSV export. Home Pulse works out the average power between your entries.
          Everything it makes from them is labelled <strong>Entered by you</strong>.
        </p>

        <form onSubmit={submitMeter} className="hp-stack-3" aria-labelledby="hp-meter-form-title">
          <h3 id="hp-meter-form-title" className="hp-explainer-title">
            Meter total
          </h3>
          <Field label="Total energy on the meter (kWh)" required error={kwhError ?? undefined}>
            <Input
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              value={kwh}
              onChange={(e) => setKwh(e.target.value)}
              placeholder="1234.56"
            />
          </Field>
          <Field label="When you read it">
            <Input
              type="datetime-local"
              value={readAt}
              onChange={(e) => setReadAt(e.target.value)}
            />
          </Field>
          <p className="hp-small hp-muted">
            Leave the time empty for now. Read the total again later and Home Pulse turns the energy
            used in between into average power, one reading per minute.
          </p>
          {record.error ? (
            <p role="alert" className="hp-form-error">
              {errorMessage(record.error)}
            </p>
          ) : null}
          {meterNote ? (
            <p role="status" className="hp-small">
              {meterNote}
            </p>
          ) : null}
          <div className="hp-button-row">
            <Button type="submit" loading={record.isPending}>
              Save reading
            </Button>
          </div>
        </form>

        <form onSubmit={submitCsv} className="hp-stack-3" aria-labelledby="hp-csv-form-title">
          <h3 id="hp-csv-form-title" className="hp-explainer-title">
            Import rows
          </h3>
          <Field label="Rows: timestamp,watts" required error={csvError ?? undefined}>
            <Textarea
              rows={5}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={'2026-11-19T10:00:00Z,118.4\n2026-11-19T10:01:00Z,117.9'}
              spellCheck={false}
            />
          </Field>
          <label className="hp-small">
            Or choose a CSV file <input type="file" accept=".csv,text/csv" onChange={onFile} />
          </label>
          <p className="hp-small hp-muted">
            One reading per line: a time with a zone (Z or +01:00), a comma, then the average watts
            for that minute. A header line is fine. Nothing is saved unless every line is valid.
          </p>
          {importRows.error ? (
            <p role="alert" className="hp-form-error">
              {errorMessage(importRows.error)}
            </p>
          ) : null}
          {csvNote ? (
            <p role="status" className="hp-small">
              {csvNote}
            </p>
          ) : null}
          <div className="hp-button-row">
            <Button type="submit" variant="secondary" loading={importRows.isPending}>
              Import rows
            </Button>
          </div>
        </form>

        {manualDeviceId ? (
          <div className="hp-stack-2">
            <p className="hp-small hp-muted">
              Readings you enter here are the only source for this appliance right now. Stop to
              connect a smart plug instead.
            </p>
            {stop.error ? (
              <p role="alert" className="hp-form-error">
                {errorMessage(stop.error)}
              </p>
            ) : null}
            <div className="hp-button-row">
              <Button variant="secondary" onClick={() => setConfirmStop(true)}>
                Stop entering readings
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmStop}
        onOpenChange={(open) => {
          setConfirmStop(open)
          if (!open) stop.reset()
        }}
        title={`Stop entering readings for ${applianceName}?`}
        description="No more readings can be entered by hand for this appliance until you enter one again. Readings already entered are kept, and a smart plug can be connected afterwards."
        confirmLabel="Stop entering readings"
        busy={stop.isPending}
        error={stop.error ? errorMessage(stop.error) : null}
        onConfirm={onStop}
      />
    </BentoCard>
  )
}
