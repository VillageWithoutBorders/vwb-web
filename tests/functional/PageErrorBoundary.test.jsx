// If a page breaks, the person sees a calm note with a button, never a blank screen.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PageErrorBoundary from '../../src/components/PageErrorBoundary'

function Broken({ message }) {
  throw new Error(message)
}

describe('PageErrorBoundary', () => {
  it('shows the page when nothing is wrong', () => {
    render(<PageErrorBoundary resetKey="/a"><p>All good</p></PageErrorBoundary>)
    expect(screen.getByText('All good')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a note and a Try again button when a page breaks', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<PageErrorBoundary resetKey="/a"><Broken message="something odd" /></PageErrorBoundary>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'This page had a problem' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  it('says VWB was updated when the broken part is a screen file from before an update', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<PageErrorBoundary resetKey="/a"><Broken message="Failed to fetch dynamically imported module: /assets/Settings-abc.js" /></PageErrorBoundary>)
    expect(screen.getByRole('heading', { name: 'VWB was just updated' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open the newest version' })).toBeInTheDocument()
    expect(screen.getByText(/Nothing you saved is lost/)).toBeInTheDocument()
  })

  it('clears the note when the person moves to another page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<PageErrorBoundary resetKey="/a"><Broken message="x" /></PageErrorBoundary>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(<PageErrorBoundary resetKey="/b"><p>Another page</p></PageErrorBoundary>)
    expect(screen.getByText('Another page')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
