import type { Part, UserMessage } from "@opencode-ai/sdk/v2"

export function questionSummary(message: UserMessage, parts: Part[]): string {
  if (message.summary?.title) return message.summary.title
  if (message.summary?.body) return message.summary.body

  const candidates = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .filter((part) => !part.synthetic && !part.ignored)

  const best = candidates.reduce((longest, part) => {
    if (!longest || part.text.length > longest.text.length) return part
    return longest
  }, undefined as Extract<Part, { type: "text" }> | undefined)

  return best?.text ?? ""
}

export function filterQuestions(
  messages: UserMessage[],
  partsByMessage: Record<string, Part[] | undefined>,
  query: string,
): UserMessage[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return messages

  return messages.filter((message) => {
    const summary = questionSummary(message, partsByMessage[message.id] ?? [])
    return summary.toLowerCase().includes(trimmed)
  })
}
