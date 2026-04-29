import assert from "node:assert/strict"
import test from "node:test"
import { countTokens } from "../src/tokenizer.js"

test("countTokens returns zero for empty text", () => {
  assert.equal(countTokens("   "), 0)
})

test("countTokens counts simple text", () => {
  assert.equal(countTokens("hello world"), 2)
})
