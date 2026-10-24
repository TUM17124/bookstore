const { ESLint } = require('eslint')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs/promises')

;(async () => {
  const tracked = execFileSync('git', ['diff', '--name-only', '--', 'src'], { encoding: 'utf8' }).trim().split('\n').filter(p => /\.tsx?$/.test(p))
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'src'], { encoding: 'utf8' }).trim().split('\n').filter(p => /\.tsx?$/.test(p))
  const eslint = new ESLint()
  // Compiler diagnostics embed file positions and code frames in their text.
  // Compare the diagnostic itself, not line shifts caused by removed imports.
  const keyFor = message => message.severity + ':' + message.ruleId + ':' + message.message.split(/\n\n[A-Z]:\\/)[0]
  const rows = []
  for (const file of [...tracked, ...untracked]) {
    const before = tracked.includes(file) ? execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' }) : ''
    const old = before ? (await eslint.lintText(before, { filePath: file }))[0] : { messages: [], errorCount: 0, warningCount: 0 }
    const current = (await eslint.lintFiles([file]))[0]
    const counts = new Map()
    for (const message of old.messages) { const key = keyFor(message); counts.set(key, (counts.get(key) || 0) + 1) }
    const introduced = current.messages.filter(message => {
      const key = keyFor(message)
      if (counts.get(key)) { counts.set(key, counts.get(key) - 1); return false }
      return true
    }).map(({ severity, ruleId, line, message }) => ({ severity, ruleId, line, message }))
    rows.push({ file, baseline: { errors: old.errorCount, warnings: old.warningCount }, current: { errors: current.errorCount, warnings: current.warningCount }, introduced })
  }
  const report = { baselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), rows }
  await fs.writeFile('audit/theme-lint-comparison.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ files: rows.length, baselineErrors: rows.reduce((n,r) => n + r.baseline.errors, 0), currentErrors: rows.reduce((n,r) => n + r.current.errors, 0), introducedErrors: rows.flatMap(r => r.introduced.filter(m => m.severity === 2).map(m => ({ file: r.file, ...m }))), introducedWarnings: rows.flatMap(r => r.introduced.filter(m => m.severity === 1).map(m => ({ file: r.file, rule: m.ruleId, line: m.line }))) }, null, 2))
})().catch(error => { console.error(error.message); process.exitCode = 1 })
