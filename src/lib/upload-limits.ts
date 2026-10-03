/**
 * The server's real upload limit for the PDF editor (nginx + Django take up
 * to 80 MB per request). Checked here before anything is sent, so a big
 * file gets a clear message instead of a failed upload.
 */
export const EDITOR_UPLOAD_MAX_MB = 80
export const EDITOR_UPLOAD_MAX_BYTES = EDITOR_UPLOAD_MAX_MB * 1024 * 1024

/** "" when the file fits, else the message to show. */
export function editorUploadProblem(file: { size: number; name?: string }): string {
  if (file.size <= EDITOR_UPLOAD_MAX_BYTES) return ""
  const mb = Math.ceil(file.size / (1024 * 1024))
  const name = file.name ? `“${file.name}” is` : "This PDF is"
  return `${name} ${mb} MB. The PDF editor takes files up to ${EDITOR_UPLOAD_MAX_MB} MB — compress or split it, then try again.`
}
