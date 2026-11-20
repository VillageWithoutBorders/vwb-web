// Links inside what neighbors write (messages, posts, event words). Only web
// addresses, emails and phone numbers become links. Nothing else can be slipped in.
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Linkify from '../../src/components/Linkify'

function show(text) {
  return render(<p data-testid="box"><Linkify text={text} /></p>)
}

describe('Linkify', () => {
  it('turns a web address into a link that opens safely in a new tab', () => {
    show('The sign-up sheet is at https://example.org/sheet?id=4 for anyone.')
    const link = screen.getByRole('link', { name: 'https://example.org/sheet?id=4' })
    expect(link).toHaveAttribute('href', 'https://example.org/sheet?id=4')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByTestId('box')).toHaveTextContent('The sign-up sheet is at https://example.org/sheet?id=4 for anyone.')
  })

  it('keeps the period or bracket at the end of a sentence out of the link', () => {
    show('Read more (https://example.org/help). Thanks!')
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org/help')
    expect(screen.getByTestId('box')).toHaveTextContent('Read more (https://example.org/help). Thanks!')
  })

  it('opens the mail app for an email address', () => {
    show('Write to help@example.org today')
    const link = screen.getByRole('link', { name: 'help@example.org' })
    expect(link).toHaveAttribute('href', 'mailto:help@example.org')
    expect(link).not.toHaveAttribute('target')
  })

  it.each([
    ['706-555-0100', 'tel:7065550100'],
    ['(706) 555-0100', 'tel:7065550100'],
    ['+1 706 555 0100', 'tel:+17065550100'],
  ])('opens the dialer for the phone number %s', (typed, href) => {
    show('Call ' + typed + ' after 5.')
    expect(screen.getByRole('link')).toHaveAttribute('href', href)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '<a href="https://evil.example">click</a>',
    '<img src=x onerror=alert(1)>',
  ])('never makes a link or a tag out of %j', (text) => {
    const { container } = show(text)
    for (const link of container.querySelectorAll('a')) {
      expect(link.getAttribute('href')).toMatch(/^(https?:\/\/|mailto:|tel:)/)
    }
    expect(container.querySelector('script, img')).toBeNull()
    expect(screen.getByTestId('box')).toHaveTextContent(text, { normalizeWhitespace: false })
  })

  it('does not treat a year range or a short number as a phone number', () => {
    const { container } = show('Open 2024-2026, room 12, about 1500 people.')
    expect(container.querySelector('a')).toBeNull()
  })

  it('shows nothing for empty text', () => {
    const { container } = render(<Linkify text="" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('handles several links in one message', () => {
    show('Site https://a.example and https://b.example, or call 706-555-0100.')
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['https://a.example', 'https://b.example', 'tel:7065550100'])
  })
})
