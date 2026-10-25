import { useState } from 'react'
import Icon from './Icon'

// "Why so many kinds of chat?" A plain guide to the chat rooms in VWB,
// smallest room first. Shown folded at the top of Messages (and anywhere else
// it helps). The idea: the bigger the room, the less you share.

const ROOMS = [
  {
    icon: 'envelope',
    name: 'Private message',
    who: 'You and one other person.',
    for: 'Setting up a ride, sharing an address for a task, a personal talk.',
    safe: 'Scrambled. Only the two of you can read it.',
  },
  {
    icon: 'cottage',
    name: 'Cottage Chat',
    who: 'A few people you choose.',
    for: 'Family, close friends, or a small crew you trust.',
    safe: 'Scrambled. Only the people in it can read it.',
  },
  {
    icon: 'campfire',
    name: 'Campfire',
    who: 'A team inside a village, group, or crew.',
    for: 'Planning and working together: a church, a nonprofit, a cleanup crew. A smaller Campfire can branch off for one job, like "Saturday food drive drivers", so the main one stays calm.',
    safe: 'Members only. You ask to join or someone adds you.',
  },
  {
    icon: 'megaphone',
    name: 'Village chat',
    who: 'Neighbors whose home village it is, plus guests.',
    for: 'Lost pets, road closures, saying hello, local news.',
    safe: 'Members only. Neighbors in its zip codes can join, and others come as guests. Keep private details out. Messages delete after 30 days.',
  },
  {
    icon: 'bridge',
    name: 'Sister Campfire',
    who: 'People from two sister villages.',
    for: 'Two villages helping each other.',
    safe: 'Anyone in either village can join. Keep private details out.',
  },
  {
    icon: 'tent',
    name: 'Response Camp',
    who: 'Everyone signed up to help with one emergency.',
    for: 'Working together during a flood, storm, fire, or outage.',
    safe: 'Opens when the emergency is checked. Closes when it ends, and is deleted 30 days later.',
  },
  {
    icon: 'globe',
    name: 'Announcements',
    who: 'Everyone on Village Without Borders.',
    for: 'News for the whole community.',
    safe: 'Everyone can read. Only Hope Ambassadors and VWB admins post.',
  },
]

export default function ChatGuide({ startOpen = false }) {
  const [open, setOpen] = useState(startOpen)
  const [room, setRoom] = useState(null)
  return (
    <section className="chat-guide" aria-labelledby="chat-guide-h">
      <button type="button" className="chat-guide-toggle" aria-expanded={open} aria-controls="chat-guide-body" onClick={() => setOpen((o) => !o)}>
        <Icon name="question" />
        <span id="chat-guide-h">Why so many kinds of chat?</span>
        <span className="chat-guide-caret" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div id="chat-guide-body" className="chat-guide-body">
          <p className="chat-guide-lead">
            Different talks need different rooms. In one big chat, private things end up in front of strangers and it gets too noisy to follow. So VWB has rooms of different sizes.
          </p>
          <p className="chat-guide-rule"><b>The bigger the room, the less you share.</b> Not sure? Pick the smallest room that fits. You can always share more later, but you can't take back what a crowd has seen.</p>
          <ol className="chat-guide-list">
            {ROOMS.map((r) => {
              // Each room is one short line (name and who). Tap it to see what it is for and how safe it is.
              const isOpen = room === r.name
              return (
                <li key={r.name} className={'chat-guide-room' + (isOpen ? ' open' : '')}>
                  <button type="button" className="chat-guide-room-btn" aria-expanded={isOpen} onClick={() => setRoom(isOpen ? null : r.name)}>
                    <span className="chat-guide-ic" aria-hidden="true"><Icon name={r.icon} size={28} /></span>
                    <span className="chat-guide-text">
                      <b>{r.name}</b>
                      <span>{r.who}</span>
                    </span>
                    <span className="chat-guide-more" aria-hidden="true">{isOpen ? '\u2212' : '+'}</span>
                  </button>
                  {isOpen && (
                    <span className="chat-guide-text chat-guide-detail">
                      <span><span className="chat-guide-label">Use it for:</span> {r.for}</span>
                      <span><span className="chat-guide-label">Safety:</span> {r.safe}</span>
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
          <p className="chat-guide-note">Smallest room at the top, biggest at the bottom. Tap a room to learn more. In every chat you can mute, leave, block, or report.</p>
          <button type="button" className="btn btn-outline btn-full" onClick={() => setOpen(false)}>Close this guide</button>
        </div>
      )}
    </section>
  )
}
