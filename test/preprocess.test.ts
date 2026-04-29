import assert from "node:assert/strict"
import test from "node:test"
import { preprocessPrompt } from "../src/preprocess.js"
import type { SessionData } from "../src/types.js"

function createSessionFixture(): SessionData {
  return {
    name: "demo-session",
    project: "Demo App",
    mode: "code",
    summary: ["Working on the CLI importer."],
    files: ["src/main.ts"],
    rules: ["Use camelCase names."],
    decisions: ["Keep imported context separate from session memory."],
    recentTurns: [],
    imports: [],
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:00.000Z",
  }
}

test("preprocessPrompt builds a structured prompt", () => {
  const result = preprocessPrompt({
    rawPrompt: "please can you review src/main.ts and don't rewrite everything",
    session: createSessionFixture(),
  })

  assert.match(result.processedPrompt, /SESSION CONTEXT:/)
  assert.match(result.processedPrompt, /CURRENT TASK:/)
  assert.match(result.processedPrompt, /FILES:/)
  assert.match(result.processedPrompt, /RULES:/)
  assert.match(result.processedPrompt, /src\/main\.ts/)
  assert.match(result.processedPrompt, /Do not rewrite unrelated code\./)
  assert.ok(result.outputTokens >= result.inputTokens)
})

test("preprocessPrompt strips filler words from the current task", () => {
  const result = preprocessPrompt({
    rawPrompt: "can you please maybe check the fix",
    session: createSessionFixture(),
  })

  assert.doesNotMatch(result.processedPrompt, /can you|please|maybe/i)
  assert.match(result.processedPrompt, /CURRENT TASK:/)
  assert.match(result.processedPrompt, /check the fix/i)
})
