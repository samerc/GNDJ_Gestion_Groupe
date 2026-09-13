// Prepend a release entry to client/src/data/changelog.json. Invoked by deploy/bump.ps1 (doing JSON in Node
// avoids Windows PowerShell 5.1's single-element-array serialization quirks). Args:
//   node bump.mjs <version> <date-yyyy-MM-dd> <messagesFile> <changelogPath>
// messagesFile = one commit subject per line (the changes since the previous version tag).
import { readFileSync, writeFileSync } from 'node:fs'

const [, , version, date, messagesFile, changelogPath] = process.argv
if (!version || !date || !messagesFile || !changelogPath) {
  console.error('usage: node bump.mjs <version> <date> <messagesFile> <changelogPath>')
  process.exit(1)
}

let list = []
try {
  const parsed = JSON.parse(readFileSync(changelogPath, 'utf8'))
  if (Array.isArray(parsed)) list = parsed
} catch {
  // Missing/empty/corrupt changelog → start fresh.
}

// Each line is "<commit-date>|<subject>" (bump.ps1 emits %ad|%s). Split into a {date, text} entry so every
// changelog line carries its own date; fall back to the release date for any line without a leading date.
const changes = readFileSync(messagesFile, 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((line) => {
    const i = line.indexOf('|')
    if (i > 0 && /^\d{4}-\d{2}-\d{2}$/.test(line.slice(0, i))) {
      return { date: line.slice(0, i), text: line.slice(i + 1).trim() }
    }
    return { date, text: line }
  })

list.unshift({ version, date, changes: changes.length ? changes : [{ date, text: 'Améliorations diverses.' }] })
writeFileSync(changelogPath, JSON.stringify(list, null, 2) + '\n')
console.log(`changelog: added v${version} (${changes.length} change(s))`)
