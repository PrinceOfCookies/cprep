import assert from "node:assert/strict"
import test from "node:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { importTextFile } from "../src/imports.js"

test("importTextFile extracts text from a Codex JSONL file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cprep-import-"))
  const filePath = path.join(tempDir, "session.jsonl")

  const jsonl = [
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Project: Demo Import" }],
      },
    }),
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Decision: keep it small." }],
      },
    }),
  ].join("\n")

  await writeFile(filePath, jsonl, "utf8")

  const imported = await importTextFile(filePath, "codex")

  assert.equal(imported.source, "codex")
  assert.equal(imported.label, "session.jsonl")
  assert.ok(imported.chunks.length > 0)
  assert.match(imported.chunks[0].text, /Project: Demo Import|Decision: keep it small\./)

  await rm(tempDir, { recursive: true, force: true })
})
