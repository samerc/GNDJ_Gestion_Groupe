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

const changes = readFileSync(messagesFile, 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean)

list.unshift({ version, date, changes: changes.length ? changes : ['Améliorations diverses.'] })
writeFileSync(changelogPath, JSON.stringify(list, null, 2) + '\n')
console.log(`changelog: added v${version} (${changes.length} change(s))`)
