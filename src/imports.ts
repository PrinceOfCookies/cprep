import fs from "node:fs/promises"
import path from "node:path"
import type { ImportedChunk, ImportedContext, ImportSource } from "./types.js"
import { countTokens } from "./tokenizer.js"
import { extractCodexJsonlText } from "./codexJsonl.js"

const chunkTokenTarget = 450
const maxImportedChunkCount = 2000

export async function importTextFile(
  sourcePath: string,
  source: ImportSource,
  label?: string
): Promise<ImportedContext> {
  const fileText = await fs.readFile(sourcePath, "utf8")
  const extension = path.extname(sourcePath).toLowerCase()

  const sourceText = extension === ".jsonl"
    ? extractCodexJsonlText(fileText)
    : fileText

  return createImportedContext({
    text: sourceText,
    source,
    label: label ?? path.basename(sourcePath)
  })
}

export function createImportedContext(options: {
  text: string
  source: ImportSource
  label: string
}): ImportedContext {
  const createdAt = new Date().toISOString()

  return {
    id: createId("import"),
    label: options.label,
    source: options.source,
    chunks: chunkImportedText(options.text),
    createdAt
  }
}

function chunkImportedText(text: string): ImportedChunk[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()

  if (!normalized) return []

  const paragraphs = normalized.split(/\n{2,}/g)
  const chunks: ImportedChunk[] = []

  let current = ""

  for (const paragraph of paragraphs) {
    const paragraphTokens = countTokens(paragraph)

    if (paragraphTokens > chunkTokenTarget) {
      if (current.trim()) {
        chunks.push(createChunk(current))
        current = ""
      }

      chunks.push(...splitLargeParagraph(paragraph))
      continue
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph

    if (countTokens(next) > chunkTokenTarget && current) {
      chunks.push(createChunk(current))
      current = paragraph
    } else {
      current = next
    }
  }

  if (current.trim()) {
    chunks.push(createChunk(current))
  }

  return chunks.slice(0, maxImportedChunkCount)
}

function splitLargeParagraph(text: string): ImportedChunk[] {
  const lines = text.split("\n").filter((line) => line.trim())
  const chunks: ImportedChunk[] = []

  let current = ""

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line

    if (countTokens(next) > chunkTokenTarget && current) {
      chunks.push(createChunk(current))
      current = line
    } else {
      current = next
    }
  }

  if (current.trim()) {
    chunks.push(createChunk(current))
  }

  return chunks
}

function createChunk(text: string): ImportedChunk {
  return {
    id: createId("chunk"),
    text: text.trim(),
    tokens: countTokens(text),
    tags: extractTags(text)
  }
}

function extractTags(text: string): string[] {
  const lower = text.toLowerCase()
  const tags = new Set<string>()

  const knownTags = [
    "economy",
    "eco",
    "money",
    "price",
    "prices",
    "balance",
    "income",
    "profit",
    "job",
    "jobs",
    "websocket",
    "sql",
    "sqlite",
    "mysql",
    "gmod",
    "glua",
    "lua",
    "rust",
    "codex",
    "error",
    "debug",
    "config"
  ]

  for (const tag of knownTags) {
    if (lower.includes(tag)) {
      tags.add(tag)
    }
  }

  const fileMatches = text.match(/\b[\w./\\-]+\.(lua|js|ts|tsx|jsx|json|rs|toml|md|css|html|sql)\b/gi) ?? []

  for (const file of fileMatches.slice(0, 8)) {
    tags.add(file)
  }

  return [...tags]
}

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${random}`
}
