import assert from "node:assert/strict"
import test from "node:test"
import { extractCodexJsonlText } from "../src/codexJsonl.js"

const sampleJsonl = [
  JSON.stringify({
    timestamp: "2026-04-28T02:21:07.278Z",
    type: "session_meta",
    payload: {
      id: "session-1",
      cwd: "E:\\Projects\\cprep",
    },
  }),
  JSON.stringify({
    timestamp: "2026-04-28T02:21:08.000Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: "Please check src/main.ts" },
      ],
    },
  }),
  JSON.stringify({
    timestamp: "2026-04-28T02:21:09.000Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "assistant",
      content: [
        { type: "output_text", text: "I will check it." },
      ],
    },
  }),
].join("\n")

test("extractCodexJsonlText keeps user and assistant message text", () => {
  const text = extractCodexJsonlText(sampleJsonl)

  assert.match(text, /Please check src\/main\.ts/)
  assert.match(text, /I will check it\./)
  assert.doesNotMatch(text, /session_meta/)
})
