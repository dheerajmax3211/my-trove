import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/ui'
import { Link } from 'react-router-dom'

/** Shown when the library is empty: what this is, and the privacy promise. */
export function FirstUse() {
  return (
    <Card className="ayl-firstuse">
      <CardHeader>
        <CardTitle as="h2">Only you can see this</CardTitle>
        <CardDescription>
          Everything you add here is private to your account. Search only ever looks at your own
          notes, documents and receipts, and nobody else can read, search or see them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="ayl-steps">
          <li>
            <strong>Add something.</strong> Paste a note, or upload a text, Markdown or HTML file.
          </li>
          <li>
            <strong>Wait a few seconds.</strong> It is indexed so you can search by words or by
            meaning.
          </li>
          <li>
            <strong>Ask in your own words.</strong> For example, &quot;how much was the
            deposit?&quot;
          </li>
        </ol>
        <Button asChild>
          <Link to="/add">Add your first note</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
