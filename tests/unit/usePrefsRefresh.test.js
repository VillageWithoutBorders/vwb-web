// Settings pickers re-read their choice when the account's settings arrive on this phone.
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePrefsRefresh } from '../../src/hooks/usePrefsRefresh'
import { applyReadButton } from '../../src/utils/readButton'

const settingsArrive = () => window.dispatchEvent(new Event('vwb:prefs'))

describe('usePrefsRefresh', () => {
  it('runs the re-read each time settings arrive', () => {
    const reread = vi.fn()
    renderHook(() => usePrefsRefresh(reread))
    expect(reread).not.toHaveBeenCalled()
    settingsArrive()
    settingsArrive()
    expect(reread).toHaveBeenCalledTimes(2)
  })

  it('hears a real setting change (the Read this to me switch)', () => {
    const reread = vi.fn()
    renderHook(() => usePrefsRefresh(reread))
    applyReadButton('on')
    expect(reread).toHaveBeenCalledTimes(1)
  })

  it('always runs the newest re-read the picker gave it', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ fn }) => usePrefsRefresh(fn), { initialProps: { fn: first } })
    rerender({ fn: second })
    settingsArrive()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stops when the picker goes away', () => {
    const reread = vi.fn()
    const { unmount } = renderHook(() => usePrefsRefresh(reread))
    unmount()
    settingsArrive()
    expect(reread).not.toHaveBeenCalled()
  })
})
