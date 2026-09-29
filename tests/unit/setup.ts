import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Vitest's `globals` option is off, so React Testing Library's automatic
// afterEach cleanup (which relies on detecting a global `afterEach`) never
// registers on its own. Without this, DOM from one test's render() leaks
// into the next, producing "multiple elements found" failures.
afterEach(() => {
  cleanup()
})
