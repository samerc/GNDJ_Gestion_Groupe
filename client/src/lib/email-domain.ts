// Extracts the (lowercased, trimmed) domain part of a typed email, or '' if there's no '@' yet.
// Used by the two login screens to suggest the OTHER portal when the domain matches / doesn't match
// the member-login domain (user_domain setting, e.g. "scouts.gndj").
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 0) return ''
  return email.slice(at + 1).trim().toLowerCase()
}

// A domain looks "complete enough" to act on when it contains a dot (e.g. gmail.com, scouts.gndj) — avoids
// firing a suggestion mid-typing of the local part.
export function isDomainish(domain: string): boolean {
  return domain.length > 0 && domain.includes('.')
}
