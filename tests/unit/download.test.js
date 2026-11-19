// Group keepers can save member lists as a spreadsheet file on their own device.
// A cell someone typed must never run as a formula when the file is opened.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileSlug, saveFile, toCsv } from '../../src/utils/download'

const BOM = String.fromCharCode(0xFEFF)
const COLUMNS = [['name', 'Name'], ['note', 'Note']]
// The data rows of a file made from these rows, without the heading row.
const body = (rows, columns = COLUMNS) => toCsv(rows, columns).split('\r\n').slice(1, -1)

describe('toCsv', () => {
  it('writes the headings, then one line per row, in the column order asked for', () => {
    const rows = [
      { name: 'Ann', note: 'Drives on Tuesdays', extra: 'not asked for' },
      { note: 'No name given' },
    ]
    expect(toCsv(rows, COLUMNS)).toBe(BOM + 'Name,Note\r\nAnn,Drives on Tuesdays\r\n,No name given\r\n')
  })

  it('starts with the mark Excel needs to show accents', () => {
    expect(toCsv([{ name: 'José' }], COLUMNS).charCodeAt(0)).toBe(0xFEFF)
  })

  it('writes only the headings when there are no rows', () => {
    expect(toCsv([], COLUMNS)).toBe(BOM + 'Name,Note\r\n')
    expect(toCsv(null, COLUMNS)).toBe(BOM + 'Name,Note\r\n')
  })

  it.each([
    ['=SUM(A1:A9)', "'=SUM(A1:A9)"],
    ['+17065550100', "'+17065550100"],
    ['-2+3', "'-2+3"],
    ['@handle', "'@handle"],
    ['\t=1+1', "'\t=1+1"],
  ])('stops %j from running as a formula', (typed, written) => {
    expect(body([{ name: typed, note: 'x' }])).toEqual([written + ',x'])
  })

  it('guards a formula even when the cell also needs quote marks, and in a heading', () => {
    expect(body([{ name: '=HYPERLINK("http://bad.example","Click")', note: 'x' }]))
      .toEqual(['"\'=HYPERLINK(""http://bad.example"",""Click"")",x'])
    expect(toCsv([], [['name', '=Name']])).toBe(BOM + "'=Name\r\n")
  })

  it('leaves ordinary text alone, including signs that are not at the start', () => {
    expect(body([{ name: 'Ann-Marie', note: 'a = b, 2 + 2' }])).toEqual(['Ann-Marie,"a = b, 2 + 2"'])
  })

  it('wraps commas, quote marks and line breaks so they stay in one cell', () => {
    expect(toCsv([{ name: 'Smith, Ann', note: 'Says "hi"\nand waves' }], COLUMNS))
      .toBe(BOM + 'Name,Note\r\n"Smith, Ann","Says ""hi""\nand waves"\r\n')
  })

  it('writes lists, objects, numbers and yes/no values as readable text', () => {
    const rows = [{ name: ['Rides', 'Food'], note: { zip: '30736' } }, { name: 0, note: false }, { name: null, note: undefined }]
    expect(body(rows)).toEqual(['Rides; Food,"{""zip"":""30736""}"', '0,false', ','])
  })
})

describe('fileSlug', () => {
  it.each([
    ['Ringgold Mutual Aid!', 'ringgold-mutual-aid'],
    ['  Año Nuevo Café  ', 'ano-nuevo-cafe'],
    ['Niños & Niñas', 'ninos-ninas'],
    ['../../etc/passwd', 'etc-passwd'],
    ['Northwest Georgia Neighbors Helping Neighbors Coalition', 'northwest-georgia-neighbors-helping-neig'],
  ])('turns %j into the file name %j', (name, slug) => {
    expect(fileSlug(name)).toBe(slug)
  })

  it.each([[''], [null], [undefined], ['***'], ['   ']])('falls back to "group" for %j', (name) => {
    expect(fileSlug(name)).toBe('group')
  })
})

describe('saveFile', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('makes the file on this device and hands it to the browser\'s own download', async () => {
    vi.useFakeTimers()
    let blob = null
    let link = null
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b; return 'blob:test-file' })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      link = { href: this.getAttribute('href'), download: this.download, onPage: document.body.contains(this) }
    })

    saveFile('ringgold-members.json', '{"members":[]}', 'application/json')

    expect(link).toEqual({ href: 'blob:test-file', download: 'ringgold-members.json', onPage: true })
    expect(document.querySelector('a')).toBeNull() // the link is cleaned up after the click
    expect(blob.type).toBe('application/json')
    expect(await blob.text()).toBe('{"members":[]}')

    vi.advanceTimersByTime(1999)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revoke).toHaveBeenCalledWith('blob:test-file')
  })
})
