/**
 * Copy / export a detected PDF table as CSV, TSV, Markdown or Excel (.xlsx).
 *
 * Pure text builders (unit-tested) plus two thin browser helpers: copy to the
 * clipboard and download a file. The .xlsx is built here with `fflate` (already
 * a dependency) - a minimal, valid SpreadsheetML package with inline strings, so
 * no spreadsheet library is needed and no cell is ever written as a formula.
 */

import { strToU8, zipSync } from "fflate"

export interface ExportCell {
  row: number
  col: number
  rowSpan?: number
  colSpan?: number
  text?: string
}

export interface ExportTable {
  rowCount: number
  colCount: number
  cells: ExportCell[]
}

export type TableExportFormat = "csv" | "markdown" | "tsv" | "xlsx"

/** Copy formats vs the one download format. */
export const COPY_FORMATS: readonly TableExportFormat[] = ["csv", "markdown", "tsv"]

/** The table as a rectangular grid of strings. A merged cell's text sits in its top-left slot; covered slots are empty. */
export function tableToGrid(table: ExportTable): string[][] {
  const rows = Math.max(0, table.rowCount)
  const cols = Math.max(0, table.colCount)
  const grid = Array.from({ length: rows }, () => Array<string>(cols).fill(""))
  for (const cell of table.cells) {
    if (cell.row >= 0 && cell.row < rows && cell.col >= 0 && cell.col < cols) {
      grid[cell.row]![cell.col] = (cell.text ?? "").replace(/\r\n?/g, "\n")
    }
  }
  return grid
}

/**
 * Spreadsheet apps run text that starts with = + - @ as a formula. A PDF can
 * carry such text, so neutralise it for the delimited formats by prefixing an
 * apostrophe - except a plain number like -5 or +3.2, which stays a number.
 */
export function neutraliseFormula(value: string): string {
  if (!/^[=+\-@\t\r]/.test(value)) return value
  if (/^[+-]?(\d+([.,]\d+)?|[.,]\d+)$/.test(value)) return value
  return `'${value}`
}

function csvField(value: string): string {
  const v = neutraliseFormula(value)
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** RFC 4180 CSV (CRLF line ends). */
export function toCsv(table: ExportTable): string {
  return tableToGrid(table).map((row) => row.map(csvField).join(",")).join("\r\n")
}

/** Tab-separated values: tabs and line breaks inside a cell become spaces. */
export function toTsv(table: ExportTable): string {
  return tableToGrid(table)
    .map((row) => row.map((v) => neutraliseFormula(v).replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n")
}

function mdCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, "<br>").trim()
}

/** GitHub-flavoured Markdown table; the first row is the header. */
export function toMarkdown(table: ExportTable): string {
  const grid = tableToGrid(table)
  if (grid.length === 0 || table.colCount === 0) return ""
  const line = (cells: string[]) => `| ${cells.map(mdCell).join(" | ")} |`
  const [header, ...body] = grid
  return [line(header!), `| ${header!.map(() => "---").join(" | ")} |`, ...body.map(line)].join("\n")
}

// ── .xlsx ────────────────────────────────────────────────────────────────────

function columnLetters(index: number): string {
  let n = index + 1
  let out = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function xmlEscape(value: string): string {
  return value
    // control characters other than tab / LF are not allowed in XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Plain decimal numbers (no leading zeros, <= 15 digits) are stored as numbers; everything else as text. */
function isPlainNumber(value: string): boolean {
  return /^-?(0|[1-9]\d{0,14})(\.\d{1,10})?$/.test(value) && value.replace(/\D/g, "").length <= 15
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** A minimal, valid .xlsx workbook (one sheet) for the table, merged cells included. */
export function toXlsx(table: ExportTable, sheetName = "Table"): Uint8Array {
  const grid = tableToGrid(table)
  const rowsXml = grid
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === "") return ""
          const ref = `${columnLetters(c)}${r + 1}`
          return isPlainNumber(value)
            ? `<c r="${ref}"><v>${value}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
        })
        .join("")
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join("")
  const merges = table.cells
    .filter((cell) => (cell.rowSpan ?? 1) > 1 || (cell.colSpan ?? 1) > 1)
    .map((cell) => {
      const last = `${columnLetters(Math.min(table.colCount, cell.col + (cell.colSpan ?? 1)) - 1)}${Math.min(table.rowCount, cell.row + (cell.rowSpan ?? 1))}`
      return `<mergeCell ref="${columnLetters(cell.col)}${cell.row + 1}:${last}"/>`
    })
  const sheet =
    XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rowsXml}</sheetData>` +
    (merges.length > 0 ? `<mergeCells count="${merges.length}">${merges.join("")}</mergeCells>` : "") +
    "</worksheet>"

  const safeName = xmlEscape(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Table")
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    ),
    "xl/workbook.xml": strToU8(
      XML_HEAD +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        "</Relationships>",
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  }
  return zipSync(files, { level: 6 })
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** Text for the three copyable formats. */
export function tableToText(table: ExportTable, format: Exclude<TableExportFormat, "xlsx">): string {
  return format === "csv" ? toCsv(table) : format === "tsv" ? toTsv(table) : toMarkdown(table)
}

// ── Browser helpers ──────────────────────────────────────────────────────────

/** Copy text to the clipboard; falls back to a hidden textarea where the async API is unavailable. Resolves false on failure. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path (permission denied / insecure context)
  }
  try {
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.append(area)
    area.select()
    const ok = document.execCommand("copy")
    area.remove()
    return ok
  } catch {
    return false
  }
}

/** Trigger a browser download of `bytes` as `fileName`. */
export function downloadBytes(bytes: Uint8Array, fileName: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
