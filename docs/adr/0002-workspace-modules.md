# 0002: One workspace hosting products as modules

**Context.** Seven product web apps each had their own sign-in. Users and reviewers should see one product.

**Decision.** A single `workspace` app mounts each product as a module (`@platform/workspace-kit` contract). The
standalone apps stay for demo mode. Rejected: micro-frontends (runtime composition, version skew, more to deploy).

**Consequences.** One build and one image for the signed-in experience; products share the shell, session and API
client. A change to one module ships the whole workspace.
