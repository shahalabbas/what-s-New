import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onAppResume, triggerAppSync, _resetLifecycleThrottleForTest } from '../src/lib/lifecycle'

describe('App Lifecycle & Foreground Sync Engine', () => {
  beforeEach(() => {
    _resetLifecycleThrottleForTest()
  })

  it('registers and triggers callbacks on app resume sync', () => {
    const callback = vi.fn()
    const unsubscribe = onAppResume(callback)

    // Trigger sync
    triggerAppSync(true)
    expect(callback).toHaveBeenCalledTimes(1)

    // Unsubscribe
    unsubscribe()
  })

  it('handles visibilitychange events when document becomes visible', async () => {
    _resetLifecycleThrottleForTest()
    const callback = vi.fn()
    onAppResume(callback)

    // Simulate visibility change to visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // The listener was called
    expect(callback).toHaveBeenCalled()
  })
})
