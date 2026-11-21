import { scopePath } from '../lib/scopes'

/** Scopes as a list of monospace chips. `label` names the list for assistive technology. */
export function ScopeList({ scopes, label }: { scopes: readonly string[]; label: string }) {
  return (
    <ul className="chips" aria-label={label}>
      {scopes.map((scope) => (
        <li key={scope}>
          <code className="chip" title={`${scopePath(scope)} and everything below it`}>
            {scope}
          </code>
        </li>
      ))}
    </ul>
  )
}
