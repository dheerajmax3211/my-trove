import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@platform/ui'
import { useRuntime } from '../../runtime/context'

/** Demo-mode sign-in: pick a user. No passwords, no network. */
export function DemoSignIn() {
  const { demo } = useRuntime()
  return (
    <main className="hub-center">
      <Card className="hub-center-card" variant="elevated">
        <CardHeader>
          <CardTitle as="h1">Sign in to the demo hub</CardTitle>
          <CardDescription>
            <Badge variant="warning">Demo mode</Badge> Data lives in this browser tab only. You can
            switch user at any time to see the other side of an invite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="hub-list">
            {demo?.users.map((u) => (
              <li key={u.uid}>
                <strong>{u.displayName}</strong>
                <span className="hub-muted">{u.blurb}</span>
                <div>
                  <Button size="sm" onClick={() => void demo.signInAs(u.uid)}>
                    {`Continue as ${u.displayName}`}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  )
}
