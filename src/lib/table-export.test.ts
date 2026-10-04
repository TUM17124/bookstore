import { describe, expect, it } from "vitest"
import { strFromU8, unzipSync } from "fflate"
import {
  neutraliseFormula,
  tableToGrid,
  tableToText,
  toCsv,
  toMarkdown,
  toTsv,
  toXlsx,
  type ExportTable,
} from "./table-export"

const table: ExportTable = {
  rowCount: 3,
  colCount: 3,
  cells: [
    { row: 0, col: 0, colSpan: 2, text: "Region" },
    { row: 0, col: 2, text: "Total" },
    { row: 1, col: 0, text: 'He said "hi", twice' },
    { row: 1, col: 1, text: "multi\nline" },
    { row: 1, col: 2, text: "1234.50" },
    { row: 2, col: 0, text: "a|b" },
    { row: 2, col: 1, text: "007" },
    { row: 2, col: 2, text: "-5" },
  ],
}

describe("table export", () => {
  it("builds a rectangular grid; a merged cell's text sits in its first slot", () => {
    expect(tableToGrid(table)).toEqual([
      ["Region", "", "Total"],
      ['He said "hi", twice', "multi\nline", "1234.50"],
      ["a|b", "007", "-5"],
    ])
  })

  it("CSV: RFC 4180 quoting, CRLF", () => {
    expect(toCsv(table)).toBe(
      ['Region,,Total', '"He said ""hi"", twice","multi\nline",1234.50', 'a|b,007,-5'].join("\r\n"),
    )
  })

  it("TSV: tabs and newlines inside a cell are flattened", () => {
    const t: ExportTable = { rowCount: 1, colCount: 2, cells: [{ row: 0, col: 0, text: "a\tb" }, { row: 0, col: 1, text: "x\ny" }] }
    expect(toTsv(t)).toBe("a b\tx y")
    expect(toTsv(table).split("\n")).toHaveLength(3)
  })

  it("Markdown: header row, separator, escaped pipes, <br> for line breaks", () => {
    expect(toMarkdown(table)).toBe(
      ["| Region |  | Total |", "| --- | --- | --- |", '| He said "hi", twice | multi<br>line | 1234.50 |', "| a\\|b | 007 | -5 |"].join("\n"),
    )
    expect(toMarkdown({ rowCount: 0, colCount: 0, cells: [] })).toBe("")
  })

  it("never lets pasted PDF text run as a spreadsheet formula (CSV/TSV), but keeps real numbers", () => {
    expect(neutraliseFormula("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")")
    expect(neutraliseFormula("@SUM(A1)")).toBe("'@SUM(A1)")
    expect(neutraliseFormula("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0")
    expect(neutraliseFormula("-5")).toBe("-5")
    expect(neutraliseFormula("+3.2")).toBe("+3.2")
    expect(neutraliseFormula("plain")).toBe("plain")
    const evil: ExportTable = { rowCount: 1, colCount: 1, cells: [{ row: 0, col: 0, text: "=1+1" }] }
    expect(toCsv(evil)).toBe("'=1+1")
    expect(tableToText(evil, "tsv")).toBe("'=1+1")
  })

  it("tableToText picks the format", () => {
    expect(tableToText(table, "csv")).toBe(toCsv(table))
    expect(tableToText(table, "markdown")).toBe(toMarkdown(table))
  })
})

describe("xlsx", () => {
  const files = () => unzipSync(toXlsx(table, "Inventory"))
  const sheet = () => strFromU8(files()["xl/worksheets/sheet1.xml"]!)

  it("is a zip with the parts Excel requires", () => {
    expect(Object.keys(files()).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ])
    expect(strFromU8(files()["xl/workbook.xml"]!)).toContain('<sheet name="Inventory"')
  })

  it("writes numbers as numbers, text (incl. leading zeros) as text, and merges spans", () => {
    const xml = sheet()
    expect(xml).toContain('<c r="C2"><v>1234.50</v></c>')
    expect(xml).toContain('<c r="C3"><v>-5</v></c>')
    expect(xml).toContain('<c r="B3" t="inlineStr"><is><t xml:space="preserve">007</t></is></c>')
    expect(xml).toContain('<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>')
    expect(xml).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">a|b</t></is></c>')
  })

  it("escapes XML and never writes a formula, even for text like =1+1", () => {
    const t: ExportTable = { rowCount: 1, colCount: 2, cells: [{ row: 0, col: 0, text: "=1+1 <b>&" }, { row: 0, col: 1, text: "bad\u0001char" }] }
    const xml = strFromU8(unzipSync(toXlsx(t))["xl/worksheets/sheet1.xml"]!)
    expect(xml).not.toContain("<f>")
    expect(xml).toContain("=1+1 &lt;b&gt;&amp;")
    expect(xml).toContain(">badchar<")
  })

  it("sanitises the sheet name (Excel forbids \\ / ? * [ ] : and > 31 chars)", () => {
    const wb = strFromU8(unzipSync(toXlsx(table, "A/B:C*" + "x".repeat(40)))["xl/workbook.xml"]!)
    const name = /<sheet name="([^"]*)"/.exec(wb)![1]!
    expect(name.length).toBeLessThanOrEqual(31)
    expect(name).not.toMatch(/[\\/?*[\]:]/)
  })
})
