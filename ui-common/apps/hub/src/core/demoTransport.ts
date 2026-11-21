/**
 * The workspace builds the module's demo `fetch` once (`createDemoFetch`) and hands it to the module's API
 * client. File downloads are not API-client calls (they are navigations to a signed link), so in demo mode
 * the pages need the same in-memory backend to serve the bytes. `createDemoFetch` registers it here.
 */
let transport: typeof fetch | null = null

export function setDemoTransport(next: typeof fetch | null): void {
  transport = next
}

export function getDemoTransport(): typeof fetch | null {
  return transport
}
