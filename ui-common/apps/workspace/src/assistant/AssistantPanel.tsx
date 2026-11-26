import { Button, Dialog, Input, Spinner } from '@platform/ui'
import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react'
import { useWorkspace } from '../workspace/context'
import { Answer } from './answers'
import { createDemoTransport } from './demoTransport'
import { INTENT_RULES, TOOL_PRODUCT, routeQuestion, type ToolName } from './intent'
import { createMcpTransport } from './transport'
import type { AssistantTransport, ToolArguments, ToolResult } from './tools'
import styles from './Assistant.module.css'

/** The permission that shows the assistant (the gateway and mcp-server check it again). */
export const ASSISTANT_PERMISSION = 'mcp:use'

export const SUGGESTIONS = [
  'What am I waiting on?',
  'Is the fridge OK?',
  'What is our household balance?',
  'When is my dentist appointment?',
] as const

interface Entry {
  id: number
  question: string
  tool: ToolName
  result: ToolResult | null
}

/** The transport for this workspace: the MCP server in a live workspace, the products' mock APIs in demo mode. */
function useTransport(): AssistantTransport {
  const { runtime, store, modules } = useWorkspace()
  return useMemo(() => {
    if (runtime.mode === 'demo') {
      return createDemoTransport((moduleId) => {
        const module = modules.find((candidate) => candidate.id === moduleId)
        return module ? store.forModule(module).client : null
      })
    }
    return createMcpTransport(store.workspace.client)
  }, [runtime.mode, store, modules])
}

/**
 * The Trove Assistant: a question goes to one product tool by fixed word rules (no language model), and the tool's
 * answer is shown with the product it came from and links into that product. Newest answer first, under the box.
 */
export function AssistantPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { runtime } = useWorkspace()
  const transport = useTransport()
  const [entries, setEntries] = useState<Entry[]>([])
  const [draft, setDraft] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const nextId = useRef(1)
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const run = useCallback(
    (question: string, tool: ToolName, args: ToolArguments) => {
      const id = nextId.current++
      setEntries((current) => [{ id, question, tool, result: null }, ...current])
      void transport(tool, args)
        .catch((): ToolResult => ({
          ok: false,
          error: {
            kind: 'unavailable',
            message: "The assistant can't reach My-Trove right now. Try again in a minute.",
          },
        }))
        .then((result) =>
          setEntries((current) =>
            current.map((entry) => (entry.id === id ? { ...entry, result } : entry)),
          ),
        )
    },
    [transport],
  )

  const ask = useCallback(
    (question: string) => {
      const intent = routeQuestion(question)
      if (!intent) {
        setHint('Type a question first.')
        return
      }
      setHint(null)
      setDraft('')
      run(question.trim(), intent.tool, intent.arguments)
    },
    [run],
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    ask(draft)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Trove Assistant"
      description="It answers from your own products' tools, not from an AI model: questions about follow-ups, appliances and household balances go to that product, and anything else searches your notes and documents."
      footer={
        <p className={styles.footer}>
          {runtime.mode === 'demo'
            ? 'Demo: answers come from made-up data in this tab. Nothing is sent or recorded.'
            : 'Each question is recorded in your audit log.'}
        </p>
      }
    >
      <form className={styles.form} onSubmit={onSubmit}>
        <Input
          aria-label="Your question"
          placeholder="Ask about follow-ups, appliances, balances or your notes"
          value={draft}
          maxLength={500}
          onChange={(event) => {
            setDraft(event.target.value)
            if (hint) setHint(null)
          }}
          {...(hint ? { invalid: true, 'aria-describedby': 'assistant-hint' } : {})}
        />
        <Button type="submit">Ask</Button>
      </form>
      {hint ? (
        <p id="assistant-hint" className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {entries.length === 0 ? (
        <div className={styles.start}>
          <p className={styles.meta}>Try one of these:</p>
          <div className={styles.choices}>
            {SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion}
                size="sm"
                variant="secondary"
                onClick={() => ask(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
          <details className={styles.rules}>
            <summary>How it picks a product</summary>
            <ul>
              {INTENT_RULES.map((rule) => (
                <li key={rule.tool}>
                  <strong>{TOOL_PRODUCT[rule.tool].title}</strong>: {rule.words}
                </li>
              ))}
              <li>
                <strong>Ask Your Life</strong>: everything else, as a search of your notes
              </li>
            </ul>
          </details>
        </div>
      ) : null}
      <ol className={styles.log} aria-label="Answers" aria-live="polite">
        {entries.map((entry) => {
          const product = TOOL_PRODUCT[entry.tool].title
          return (
            <li key={entry.id} className={styles.entry}>
              <p className={styles.question}>{entry.question}</p>
              <div className={styles.answer}>
                <p className={styles.source}>From {product}</p>
                {entry.result === null ? (
                  <Spinner size={18} label={`Asking ${product}`} />
                ) : entry.result.ok ? (
                  <Answer
                    tool={entry.tool}
                    data={entry.result.data}
                    question={entry.question}
                    onNavigate={close}
                    onChooseHousehold={(household) =>
                      run(household.name, 'family_treasury_ledger_summary', {
                        householdId: household.id,
                      })
                    }
                  />
                ) : (
                  <p className={styles.error}>{entry.result.error.message}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Dialog>
  )
}
