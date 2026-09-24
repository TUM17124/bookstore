import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from '@cantoo/pdf-lib'
import type { EditorPage } from '@/lib/pdf-editor-types'

export type DetectedFieldKind = 'text' | 'checkbox' | 'dropdown' | 'radio'

/** An existing AcroForm field found on an uploaded PDF, positioned in the
 * same xf/yf/wf/hf fraction space as editor elements so it can be rendered
 * with a plain overlay input. Filled values are flattened into the page's
 * content at export time — the output PDF is not still interactive. */
export type DetectedField = {
  id: string
  pageId: string
  docIndex: number
  name: string
  kind: DetectedFieldKind
  xf: number
  yf: number
  wf: number
  hf: number
  value: string
  checked: boolean
  options: string[]
}

export async function detectFormFields(
  sourceDocs: (PDFDocument | null)[],
  pages: EditorPage[],
): Promise<DetectedField[]> {
  const results: DetectedField[] = []

  for (let docIndex = 0; docIndex < sourceDocs.length; docIndex++) {
    const doc = sourceDocs[docIndex]
    if (!doc) continue

    let form
    try {
      form = doc.getForm()
    } catch {
      continue
    }
    const fields = form.getFields()
    if (fields.length === 0) continue

    const pdfPages = doc.getPages()

    for (const field of fields) {
      let kind: DetectedFieldKind
      let value = ''
      let checked = false
      let options: string[] = []

      if (field instanceof PDFTextField) {
        kind = 'text'
        value = field.getText() || ''
      } else if (field instanceof PDFCheckBox) {
        kind = 'checkbox'
        checked = field.isChecked()
      } else if (field instanceof PDFDropdown) {
        kind = 'dropdown'
        options = field.getOptions()
        value = field.getSelected()[0] || options[0] || ''
      } else if (field instanceof PDFRadioGroup) {
        kind = 'radio'
        options = field.getOptions()
        value = field.getSelected() || options[0] || ''
      } else {
        continue // buttons, signatures, option lists — not supported in Phase 2
      }

      const widgets = field.acroField.getWidgets()
      for (const widget of widgets) {
        const pageRef = widget.P()
        const pageIndex = pageRef ? pdfPages.findIndex((p) => p.ref === pageRef) : -1
        if (pageIndex === -1) continue

        const editorPage = pages.find(
          (p) => p.source.kind === 'copy' && p.source.docIndex === docIndex && p.source.originalIndex === pageIndex,
        )
        if (!editorPage) continue

        const { x, y, width, height } = widget.getRectangle()
        results.push({
          id: `${docIndex}:${field.getName()}:${results.length}`,
          pageId: editorPage.id,
          docIndex,
          name: field.getName(),
          kind,
          xf: x / editorPage.widthPt,
          yf: 1 - (y + height) / editorPage.heightPt,
          wf: width / editorPage.widthPt,
          hf: height / editorPage.heightPt,
          value,
          checked,
          options,
        })
      }
    }
  }

  return results
}

/** Loads a fresh copy of a source PDF's bytes, fills in the given field
 * values, and flattens the form so the filled appearance becomes part of
 * the page content. Operates on a scratch document — never mutates the
 * live, still-interactive source document held by the editor session. */
export async function buildFilledFlattenedDoc(bytes: Uint8Array, fields: DetectedField[]): Promise<PDFDocument> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form = doc.getForm()
  for (const f of fields) {
    try {
      if (f.kind === 'text') {
        form.getTextField(f.name).setText(f.value)
      } else if (f.kind === 'checkbox') {
        const cb = form.getCheckBox(f.name)
        if (f.checked) cb.check()
        else cb.uncheck()
      } else if (f.kind === 'dropdown') {
        if (f.value) form.getDropdown(f.name).select(f.value)
      } else if (f.kind === 'radio') {
        if (f.value) form.getRadioGroup(f.name).select(f.value)
      }
    } catch {
      // Field missing/renamed since detection — skip it rather than fail the whole export.
    }
  }
  form.flatten()
  return doc
}


