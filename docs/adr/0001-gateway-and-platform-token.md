# 0001: One gateway and a platform token

**Context.** Ten services each verified Firebase tokens on their own and had no shared notion of roles. Personas
(owner, admin, developer, member, auditor) and plan limits needed one place to be enforced.

**Decision.** A Spring Cloud Gateway is the only public entrance. It exchanges the Firebase token at auth for a
short-lived platform token (RS256, published JWKS) that carries the user's permissions and a `permissions_version`.
Every service still verifies that token itself. Rejected: RBAC as a shared library only (every service would need
the user store), and a service mesh (heavy, and needs a real cluster to demonstrate).

**Consequences.** One hop more per request. Role changes reach a cached exchange within 60 seconds. Services do not
trust network position, so a request that bypasses the gateway still needs a valid token.
