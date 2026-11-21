import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Snippet } from '../../../components/Snippet'
import { decodeEntities, parseSnippet, snippetToText } from './snippet'

describe('parseSnippet', () => {
  it('splits plain text and marked matches', () => {
    expect(parseSnippet('The <mark>smoke</mark> <mark>detector</mark> works')).toEqual([
      { text: 'The ', marked: false },
      { text: 'smoke', marked: true },
      { text: ' ', marked: false },
      { text: 'detector', marked: true },
      { text: ' works', marked: false },
    ])
  })

  it('decodes the entities the backend produces, once', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &amp;lt;')).toBe('a & b <c> &lt;')
    expect(snippetToText('5 &gt; 3 &amp;&amp; 2 &lt; 4')).toBe('5 > 3 && 2 < 4')
  })

  it('treats escaped mark tags in the document text as plain text, not highlighting', () => {
    const segments = parseSnippet('&lt;mark&gt;fake&lt;/mark&gt; and <mark>real</mark>')
    expect(segments).toEqual([
      { text: '<mark>fake</mark> and ', marked: false },
      { text: 'real', marked: true },
    ])
  })

  it('only accepts the exact lowercase mark tags', () => {
    const text = '<MARK>x</MARK> <mark class="a">y <markx>z</markx>'
    expect(parseSnippet(text)).toEqual([{ text, marked: false }])
  })

  it('survives unbalanced tags', () => {
    expect(parseSnippet('</mark>oops')).toEqual([{ text: 'oops', marked: false }])
    expect(parseSnippet('<mark>never closed')).toEqual([{ text: 'never closed', marked: true }])
    expect(parseSnippet('')).toEqual([])
  })
})

describe('<Snippet> with hostile input', () => {
  const hostile = [
    '<script>window.__pwned = 1</script>',
    '<img src=x onerror="window.__pwned = 2">',
    '<a href="javascript:window.__pwned = 3">click</a>',
    '<iframe src="https://evil.example"></iframe>',
    '<mark onmouseover="window.__pwned = 4">hover</mark>',
    '<style>body { display: none }</style>',
  ].join(' ')

  it('never creates elements other than mark from snippet text', () => {
    const { container } = render(<Snippet snippet={`<mark>match</mark> ${hostile}`} />)
    expect(container.querySelectorAll('script, img, a, iframe, style')).toHaveLength(0)
    // Only the paragraph and the one real match exist; the hostile markup stayed text.
    expect(container.querySelectorAll('*')).toHaveLength(2)
    const marks = container.querySelectorAll('mark')
    expect(marks[0]?.textContent).toBe('match')
    for (const mark of marks) expect(mark.attributes).toHaveLength(0)
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('shows hostile text literally', () => {
    const { container } = render(
      <Snippet snippet="&lt;img src=x onerror=alert(1)&gt; <mark>ok</mark>" />,
    )
    expect(container.textContent).toBe('<img src=x onerror=alert(1)> ok')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelectorAll('mark')).toHaveLength(1)
  })

  it('renders matches as mark elements', () => {
    const { container } = render(<Snippet snippet="a <mark>b</mark> c" />)
    expect(container.innerHTML).toBe('<p>a <mark>b</mark> c</p>')
  })
})
