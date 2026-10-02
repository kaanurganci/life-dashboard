import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { SignOutButton } from '@/app/sign-out-button'

const order: string[] = []
const removeClient = vi.fn()
const signOut = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: () => { order.push('navigate') },
    refresh: vi.fn(),
  }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabase: () => ({ auth: { signOut } }),
}))
vi.mock('@/lib/query-client', () => ({
  createIdbPersister: () => ({ removeClient: () => removeClient() }),
}))

let sessionLive = true

beforeEach(() => {
  order.length = 0
  sessionLive = true
  removeClient.mockReset().mockImplementation(async () => { order.push('removeClient') })
  signOut.mockReset().mockImplementation(async () => {
    sessionLive = false
    order.push('signOut')
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function renderButton(client: QueryClient) {
  render(
    <QueryClientProvider client={client}>
      <SignOutButton userId="user-a" />
    </QueryClientProvider>,
  )
  return userEvent.setup().click(screen.getByRole('button', { name: /sign out/i }))
}

describe('SignOutButton', () => {
  it('signs out, then clears memory and the persisted cache, then navigates', async () => {
    const client = new QueryClient()
    client.setQueryData(['entries', '2026-09-24'], [{ metric_id: 'a' }])

    await renderButton(client)

    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(order).toEqual(['signOut', 'removeClient', 'navigate'])
  })

  it('still navigates if the persisted cache cannot be cleared', async () => {
    removeClient.mockRejectedValue(new Error('IndexedDB unavailable'))
    const client = new QueryClient()
    client.setQueryData(['entries', '2026-09-24'], [{ metric_id: 'a' }])

    await renderButton(client)

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['signOut', 'navigate'])
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })

  // A mounted observer rebuilds and refetches a query as soon as the cache is
  // cleared. If that happens while the old session is still live, user A's data
  // is fetched (and re-persisted) after sign-out began.
  // A guard on ordering, not a proof of the race: jsdom does not reproduce the
  // refetch-on-clear under the old order, so the order assertion above is what
  // actually pins the fix.
  it('guard: no refetch under the old session with an observer mounted', async () => {
    const fetchedWhileSignedIn: boolean[] = []
    function Observer() {
      useQuery({
        queryKey: ['entries', '2026-09-24'],
        queryFn: async () => { fetchedWhileSignedIn.push(sessionLive); return [] },
        staleTime: 0,
      })
      return null
    }
    const client = new QueryClient()

    render(
      <QueryClientProvider client={client}>
        <Observer />
        <SignOutButton userId="user-a" />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(fetchedWhileSignedIn).toHaveLength(1))
    fetchedWhileSignedIn.length = 0

    await userEvent.setup().click(screen.getByRole('button', { name: /sign out/i }))
    await new Promise((r) => setTimeout(r, 50))

    expect(fetchedWhileSignedIn.filter(Boolean)).toHaveLength(0)
  })
})
