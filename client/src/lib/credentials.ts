// One ready-to-send message with both credentials (for pasting into WhatsApp / a chat to the member).
export function credentialsMessage(username: string, password: string): string {
  return `Identifiant : ${username}\nMot de passe temporaire : ${password}\nÀ changer à la première connexion.`
}
