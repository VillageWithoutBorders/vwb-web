// A skin can bring its own drawings. A picture not drawn yet falls back to today's
// picture, so nothing ever shows as a broken image.
import { afterEach, describe, expect, it, vi } from 'vitest'

// The list of drawings that exist is fixed when the app is built (__SKIN_ART__). The
// test settings leave it empty, so each test sets its own list and loads a fresh copy.
async function load(files, skin) {
  vi.stubGlobal('__SKIN_ART__', files)
  vi.resetModules()
  const { setSkinLocal } = await import('../../src/utils/skin')
  const { skinArt } = await import('../../src/utils/skinArt')
  if (skin) setSkinLocal(skin)
  return skinArt
}

const SPACE_CHAT = '/art/skins/space/village-path/spot-chat.webp'
const FAIRY_CHAT = '/art/skins/fairy/village-path/spot-chat.webp'

describe('skinArt', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('swaps in the skin\'s own drawing, same folder and name', async () => {
    const skinArt = await load([SPACE_CHAT, FAIRY_CHAT], 'space')
    expect(skinArt('/art/village-path/spot-chat.webp')).toBe(SPACE_CHAT)
  })

  it('shows today\'s picture when the skin has no drawing for it yet', async () => {
    const skinArt = await load([SPACE_CHAT], 'space')
    expect(skinArt('/art/village-path/spot-map.webp')).toBe('/art/village-path/spot-map.webp')
    // A drawing made for another skin does not count.
    const fairy = await load([SPACE_CHAT], 'fairy')
    expect(fairy('/art/village-path/spot-chat.webp')).toBe('/art/village-path/spot-chat.webp')
  })

  it('leaves every picture alone on Home Place', async () => {
    const skinArt = await load([SPACE_CHAT], null)
    expect(skinArt('/art/village-path/spot-chat.webp')).toBe('/art/village-path/spot-chat.webp')
  })

  it('shows Home Place pictures in Simple view, whatever skin was picked', async () => {
    const skinArt = await load([SPACE_CHAT], 'space')
    document.documentElement.classList.add('simple')
    expect(skinArt('/art/village-path/spot-chat.webp')).toBe('/art/village-path/spot-chat.webp')
  })

  it('only touches pictures from the app\'s own art folder', async () => {
    const skinArt = await load([SPACE_CHAT, '/art/skins/space/icons/home.png'], 'space')
    // The skin does have /art/skins/space/icons/home.png, but this picture is not from /art/.
    expect(skinArt('/img/icons/home.png')).toBe('/img/icons/home.png')
    expect(skinArt('/art/icons/home.png')).toBe('/art/skins/space/icons/home.png')
    expect(skinArt('')).toBe('')
    expect(skinArt(null)).toBeNull()
    expect(skinArt(undefined)).toBeUndefined()
  })

  it('leaves every picture alone when the app was built with no skin drawings', async () => {
    const skinArt = await load([], 'space')
    expect(skinArt('/art/village-path/spot-chat.webp')).toBe('/art/village-path/spot-chat.webp')
  })
})
