import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SignOutButton } from '@/app/sign-out-button'

const order: string[] = []
const removeClient = vi.fn()
const signOut = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabase: () => ({ auth: { signOut } }),
}))
vi.mock('@/lib/query-client', () => ({
  idbPersister: { removeClient: () => removeClient() },
}))

beforeEach(() => {
  order.length = 0
  removeClient.mockReset().mockImplementation(async () => { order.push('removeClient') })
  signOut.mockReset().mockImplementation(async () => { order.push('signOut') })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function renderButton(client: QueryClient) {
  render(<QueryClientProvider client={client}><SignOutButton /></QueryClientProvider>)
  return userEvent.setup().click(screen.getByRole('button', { name: /sign out/i }))
}

describe('SignOutButton', () => {
  it('clears memory and the persisted cache before signing out', async () => {
    const client = new QueryClient()
    client.setQueryData(['entries', '2026-09-24'], [{ metric_id: 'a' }])

    await renderButton(client)

    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(order).toEqual(['removeClient', 'signOut'])
  })

  it('still signs out if the persisted cache cannot be cleared', async () => {
    removeClient.mockRejectedValue(new Error('IndexedDB unavailable'))
    const client = new QueryClient()
    client.setQueryData(['entries', '2026-09-24'], [{ metric_id: 'a' }])

    await renderButton(client)

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })
})
