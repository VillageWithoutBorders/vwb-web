// A request can be posted for someone else (a neighbor with no phone, say). Helpers must
// be told plainly who the help is for and who they will really be talking with.
import { describe, expect, it } from 'vitest'
import { forLine, forTitle, helperNote } from '../../src/utils/forSomeone'

const FOR_RUTH = { for_name: 'Ruth', skill_needed: 'Yard work' }
const OWN = { for_name: null, skill_needed: 'Yard work' }

describe('forLine', () => {
  it('says who the request is for and who posted it', () => {
    expect(forLine(FOR_RUTH, 'Jade')).toBe('For Ruth, posted by Jade')
  })

  it('leaves the poster out when their name is not known', () => {
    expect(forLine(FOR_RUTH)).toBe('For Ruth')
    expect(forLine(FOR_RUTH, '')).toBe('For Ruth')
  })

  it('says nothing for a request people posted for themselves', () => {
    expect(forLine(OWN, 'Jade')).toBe('')
    expect(forLine({ for_name: '   ' }, 'Jade')).toBe('')
    expect(forLine(null, 'Jade')).toBe('')
  })
})

describe('forTitle', () => {
  it('adds the neighbor\'s name to the kind of help', () => {
    expect(forTitle(FOR_RUTH)).toBe('Yard work for Ruth')
    expect(forTitle({ for_name: '  Ruth ', skill_needed: 'Rides' })).toBe('Rides for Ruth')
  })

  it('is just the kind of help for a request people posted for themselves', () => {
    expect(forTitle(OWN)).toBe('Yard work')
  })

  it('falls back to "Help request", or the words the screen passes in, when no kind was picked', () => {
    expect(forTitle({ for_name: 'Ruth' })).toBe('Help request for Ruth')
    expect(forTitle({})).toBe('Help request')
    expect(forTitle(null, 'Request')).toBe('Request')
  })
})

describe('helperNote', () => {
  it('tells the helper they will talk with the poster, who passes things along', () => {
    expect(helperNote(FOR_RUTH, 'Jade')).toBe('You will talk with Jade. They will pass things along to Ruth.')
  })

  it('still makes sense when the poster\'s name is not known', () => {
    expect(helperNote(FOR_RUTH)).toBe('You will talk with the person who posted this. They will pass things along to Ruth.')
  })

  it('says nothing for a request people posted for themselves', () => {
    expect(helperNote(OWN, 'Jade')).toBe('')
    expect(helperNote(undefined, 'Jade')).toBe('')
  })
})
