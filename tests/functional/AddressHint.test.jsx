// The gentle note under a text box when what is typed looks like a home address.
// It never blocks posting. It is announced to screen readers when it appears.
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import AddressHint from '../../src/components/AddressHint'

describe('AddressHint', () => {
  it('says nothing for ordinary words, but keeps its place so the page does not jump', () => {
    render(<AddressHint text="I need a ride on Tuesday" id="hint" />)
    const note = screen.getByRole('status')
    expect(note).toBeEmptyDOMElement()
    expect(note).toHaveAttribute('id', 'hint')
    expect(note).toHaveAttribute('aria-live', 'polite')
  })

  it('shows the note when the words look like an address', () => {
    render(<AddressHint text="Come to 123 Main Street" id="hint" />)
    expect(screen.getByRole('status')).toHaveTextContent('This looks like an address. Other people can read this. Take it out, and share it in a private message instead.')
  })

  it('goes away again when the address is taken out', () => {
    const { rerender } = render(<AddressHint text="Apt 4B" id="hint" />)
    expect(screen.getByRole('status')).not.toBeEmptyDOMElement()
    rerender(<AddressHint text="By the library" id="hint" />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
