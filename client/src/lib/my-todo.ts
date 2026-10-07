// What is left in a member's yearly to-do (GET /my-profile/todo or one child of /my-profile/family), in short
// words — same rules as the « Ma rentrée » card: a document waiting for the chef's check or a cotisation paid in
// part is NOT something left for the family to do.
import type { MyTodo } from '@/services/my-profile-service'

export function todoLeft(todo: MyTodo): string[] {
  const left: string[] = []
  if (!todo.contactsDone) left.push('vérifier les coordonnées')
  if (todo.docsRejected > 0) left.push(`${todo.docsRejected} document${todo.docsRejected > 1 ? 's' : ''} refusé${todo.docsRejected > 1 ? 's' : ''} à renvoyer`)
  if (todo.docsMissing > 0) left.push(`${todo.docsMissing} document${todo.docsMissing > 1 ? 's' : ''} à envoyer`)
  if (todo.cotisationStatus && !['Paid', 'Exempt', 'Partial'].includes(todo.cotisationStatus)) left.push('cotisation à régler')
  return left
}
