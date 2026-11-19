// A "..." menu must always land fully on screen: below its button when there is room,
// flipped above when there is not, and never under the top bar or the bottom tab bar.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMenuPosition } from '../../src/utils/useMenuPosition'

// The test browser has no real layout, so the screen, button and menu sizes are pretend ones.
// A phone-sized screen: 400 wide, 800 tall. The top bar takes 60px and the tab bar 72px.
beforeEach(() => {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400)
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
})

// Where the "..." button sits: 40px tall, its right edge at 380.
const buttonAt = (top) => ({ top, bottom: top + 40, left: 340, right: 380 })

function menu({ height = 200, align } = {}) {
  const hook = renderHook(() => useMenuPosition(align))
  hook.result.current.menuRef.current = { getBoundingClientRect: () => ({ height }) }
  return hook
}

describe('useMenuPosition', () => {
  it('has no position while the menu is closed', () => {
    expect(menu().result.current.menuStyle).toBeNull()
  })

  it('opens just below the button, lined up with its right edge', () => {
    const { result } = menu()
    act(() => result.current.openMenu(buttonAt(100)))
    expect(result.current.menuStyle).toMatchObject({ position: 'fixed', top: 148, right: 20 })
    expect(result.current.menuStyle).not.toHaveProperty('bottom')
    expect(result.current.menuStyle).not.toHaveProperty('left')
  })

  it('reads the button position from a click', () => {
    const { result } = menu()
    act(() => result.current.openMenu({ currentTarget: { getBoundingClientRect: () => buttonAt(100) } }))
    expect(result.current.menuStyle).toMatchObject({ top: 148, right: 20 })
  })

  it('flips above the button when it would run under the bottom tab bar', () => {
    const { result } = menu({ height: 200 })
    act(() => result.current.openMenu(buttonAt(600)))
    expect(result.current.menuStyle).toMatchObject({ bottom: 208 })
    expect(result.current.menuStyle).not.toHaveProperty('top')
  })

  it('stays below when it fits exactly above the tab bar', () => {
    const { result } = menu({ height: 200 })
    act(() => result.current.openMenu(buttonAt(480)))
    expect(result.current.menuStyle).toMatchObject({ top: 528 })
  })

  it('stays below, and scrolls inside, when there is no room above either', () => {
    const { result } = menu({ height: 700 })
    act(() => result.current.openMenu(buttonAt(300)))
    expect(result.current.menuStyle).toMatchObject({ top: 348, overflowY: 'auto', maxHeight: 'calc(100vh - 132px)' })
    expect(result.current.menuStyle).not.toHaveProperty('bottom')
  })

  it('never starts below the tab bar, even for a button at the very bottom', () => {
    const { result } = menu({ height: 700 })
    act(() => result.current.openMenu(buttonAt(760)))
    expect(result.current.menuStyle.top).toBe(728)
  })

  it('can line up with the left edge of the button instead', () => {
    const { result } = menu({ align: 'left' })
    act(() => result.current.openMenu(buttonAt(100)))
    expect(result.current.menuStyle).toMatchObject({ left: 340 })
    expect(result.current.menuStyle).not.toHaveProperty('right')
  })

  it('one menu can be left-aligned just this once, then goes back to its usual side', () => {
    const { result } = menu()
    act(() => result.current.openMenu(buttonAt(100), 'left'))
    expect(result.current.menuStyle).toMatchObject({ left: 340 })
    act(() => result.current.openMenu(buttonAt(100)))
    expect(result.current.menuStyle).toMatchObject({ right: 20 })
  })

  it('keeps a small gap from the screen edge for a button right at the edge', () => {
    const { result } = menu()
    act(() => result.current.openMenu({ top: 100, bottom: 140, left: 0, right: 400 }))
    expect(result.current.menuStyle.right).toBe(8)
    act(() => result.current.openMenu({ top: 100, bottom: 140, left: 0, right: 400 }, 'left'))
    expect(result.current.menuStyle.left).toBe(8)
  })

  it('closing clears the position, and the next menu starts below again', () => {
    const { result } = menu({ height: 200 })
    act(() => result.current.openMenu(buttonAt(600)))
    expect(result.current.menuStyle).toHaveProperty('bottom')
    act(() => result.current.closeMenu())
    expect(result.current.menuStyle).toBeNull()
    act(() => result.current.openMenu(buttonAt(100)))
    expect(result.current.menuStyle).toMatchObject({ top: 148 })
    expect(result.current.menuStyle).not.toHaveProperty('bottom')
  })
})
