// Admins bring resource lists in from spreadsheets and send changes back out.
// A comma, a quote mark or a line break inside a cell must never shift the columns.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { csvToObjects, downloadText, parseCsv, toCsv } from '../../src/utils/csv'

// The invisible mark (BOM) some spreadsheet programs put at the start of a file.
const BOM = String.fromCharCode(0xFEFF)

describe('parseCsv', () => {
  it('reads a spreadsheet export with quoted commas, quote marks and line breaks inside cells', () => {
    const text = BOM + 'name,phone,notes\r\n'
      + '"Smith, Ann",706-555-0100,"Says ""call first"""\r\n'
      + '\r\n'
      + 'Bob,,"line one\r\nline two"\r\n'
      + ' , ,\r\n'
    expect(parseCsv(text)).toEqual([
      ['name', 'phone', 'notes'], // the invisible mark at the start of the file is gone
      ['Smith, Ann', '706-555-0100', 'Says "call first"'],
      ['Bob', '', 'line one\r\nline two'],
    ])
  })

  it.each([
    ['Windows', 'a,b\r\nc,d\r\n'],
    ['Mac and Linux', 'a,b\nc,d\n'],
    ['old Mac', 'a,b\rc,d\r'],
    ['no line ending on the last row', 'a,b\nc,d'],
  ])('splits rows on %s line endings', (_name, text) => {
    expect(parseCsv(text)).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('keeps empty cells in their place, at the start, the middle and the end of a row', () => {
    expect(parseCsv(',b,,d,\n')).toEqual([['', 'b', '', 'd', '']])
    expect(parseCsv('a,""')).toEqual([['a', '']])
  })

  it('keeps spaces inside a cell as typed', () => {
    expect(parseCsv('a, b ," c "')).toEqual([['a', ' b ', ' c ']])
  })

  it.each([[''], [null], [undefined], ['\r\n\r\n'], [' , \n,,']])('finds no rows in %j', (text) => {
    expect(parseCsv(text)).toEqual([])
  })
})

describe('csvToObjects', () => {
  it('uses the first row as headings, trims them, and fills short rows with blanks', () => {
    const { headers, rows } = csvToObjects(' Name , Zip ,Notes\nAnn,30736,"Tue, Thu"\nBob\n')
    expect(headers).toEqual(['Name', 'Zip', 'Notes'])
    expect(rows).toEqual([
      { Name: 'Ann', Zip: '30736', Notes: 'Tue, Thu' },
      { Name: 'Bob', Zip: '', Notes: '' },
    ])
  })

  it('leaves out a column that has no heading', () => {
    const { rows } = csvToObjects('Name,,Zip\nAnn,stray,30736')
    expect(rows).toEqual([{ Name: 'Ann', Zip: '30736' }])
  })

  it('gives empty lists for an empty file and for a file with only headings', () => {
    expect(csvToObjects('')).toEqual({ headers: [], rows: [] })
    expect(csvToObjects('Name,Zip\n')).toEqual({ headers: ['Name', 'Zip'], rows: [] })
  })
})

describe('toCsv', () => {
  it('puts quote marks only around cells that need them', () => {
    const text = toCsv(['Name', 'Notes, if any'], [
      ['Ann', 'plain'],
      ['Smith, Bob', 'says "hi"'],
      ['Cy', 'line one\nline two'],
    ])
    expect(text).toBe('Name,"Notes, if any"\r\nAnn,plain\r\n"Smith, Bob","says ""hi"""\r\nCy,"line one\nline two"')
  })

  it('writes nothing for a missing value but keeps 0 and false', () => {
    expect(toCsv(['a', 'b', 'c', 'd'], [[null, undefined, 0, false]])).toBe('a,b,c,d\r\n,,0,false')
  })

  it('writes a file that parseCsv reads back the same', () => {
    const headers = ['Name', 'Notes']
    const rows = [['Smith, Ann', 'Says "call first"'], ['Bob', 'line one\r\nline two'], ['Cy', '']]
    expect(parseCsv(toCsv(headers, rows))).toEqual([headers, ...rows])
  })
})

describe('downloadText', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('hands the browser a file that starts with the mark Excel needs to show accents', async () => {
    vi.useFakeTimers()
    let blob = null
    let link = null
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b; return 'blob:test-file' })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      link = { href: this.getAttribute('href'), download: this.download, onPage: document.body.contains(this) }
    })

    downloadText('recursos.csv', 'Nombre\r\nJosé')

    expect(link).toEqual({ href: 'blob:test-file', download: 'recursos.csv', onPage: true })
    expect(document.querySelector('a')).toBeNull() // the link is cleaned up after the click
    expect(blob.type).toBe('text/csv;charset=utf-8')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('Nombre\r\nJosé')

    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revoke).toHaveBeenCalledWith('blob:test-file')
  })
})
