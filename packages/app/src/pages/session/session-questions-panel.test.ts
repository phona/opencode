import { describe, expect, test } from "bun:test"
import type { Part, UserMessage } from "@opencode-ai/sdk/v2"
import { filterQuestions, questionSummary } from "./session-questions-utils"

const userMessage = (id: string, summary?: { title?: string; body?: string }): UserMessage =>
  ({
    id,
    role: "user",
    sessionID: "ses_1",
    time: { created: 0 },
    agent: "default",
    model: { providerID: "openai", modelID: "gpt-4" },
    summary: summary ? { ...summary, diffs: [] } : undefined,
  }) as UserMessage

const textPart = (text: string): Part =>
  ({
    type: "text",
    text,
    id: "part_1",
    sessionID: "ses_1",
    messageID: "msg_1",
  }) as Part

describe("session questions panel", () => {
  test("uses summary title when available", () => {
    const message = userMessage("msg_1", { title: "Refactor auth" })
    expect(questionSummary(message, [])).toBe("Refactor auth")
  })

  test("falls back to summary body", () => {
    const message = userMessage("msg_1", { body: "Clean up token logic" })
    expect(questionSummary(message, [])).toBe("Clean up token logic")
  })

  test("falls back to text parts", () => {
    const message = userMessage("msg_1")
    expect(questionSummary(message, [textPart("Hello world")])).toBe("Hello world")
  })

  test("ignores synthetic and ignored text parts", () => {
    const message = userMessage("msg_1")
    const ignored = { ...textPart("ignored"), ignored: true } as Part
    expect(questionSummary(message, [ignored, textPart("real")])).toBe("real")
  })

  test("returns empty string when no text exists", () => {
    const message = userMessage("msg_1")
    expect(questionSummary(message, [])).toBe("")
  })

  test("filters questions by query", () => {
    const a = userMessage("msg_1", { title: "Refactor auth" })
    const b = userMessage("msg_2", { title: "Update tests" })
    const parts: Record<string, Part[] | undefined> = { msg_1: [], msg_2: [] }
    expect(filterQuestions([a, b], parts, "auth").map((m) => m.id)).toEqual(["msg_1"])
  })

  test("filter is case-insensitive and trims whitespace", () => {
    const a = userMessage("msg_1", { title: "Refactor auth" })
    const parts: Record<string, Part[] | undefined> = { msg_1: [] }
    expect(filterQuestions([a], parts, "  AUTH  ").map((m) => m.id)).toEqual(["msg_1"])
  })
})
