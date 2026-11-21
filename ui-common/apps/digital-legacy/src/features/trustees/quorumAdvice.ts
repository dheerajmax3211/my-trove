/** What a t-of-n choice means, in sentences a non-cryptographer can act on. */
export function describeQuorum(t: number, n: number): string[] {
  if (n < 1) return ['Invite at least one trustee first.']
  const lines = [
    `Any ${t} of your ${n} trustee${n === 1 ? '' : 's'} together can open the vault once release is approved. Fewer than ${t} learn nothing at all, not even part of it.`,
  ]
  const spare = n - t
  if (t === 1)
    lines.push(
      'A single trustee can open everything on their own. Choose this only if you trust every one of them completely.',
    )
  if (spare === 0)
    lines.push(
      `There is no margin: if even one trustee loses their key or cannot be reached, the vault can never be opened.`,
    )
  else
    lines.push(
      `Up to ${spare} trustee${spare === 1 ? '' : 's'} can lose their key or be unreachable and the vault still opens. If more than ${spare} are lost, it can never be opened.`,
    )
  if (t === n && n > 1)
    lines.push('Every trustee must agree and cooperate before anything is released.')
  return lines
}
