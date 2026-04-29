import type { ProcessResult, SessionData, PromptMode } from "./types.js"
import { countTokens } from "./tokenizer.js"
import { getPresetOutput, getPresetRules } from "./presets.js"

interface PreprocessOptions {
  rawPrompt: string
  session?: SessionData
  mode?: PromptMode
  compact?: boolean
  includeImports?: boolean
}

const maxSessionTokens = 500
const maxMemoryEntryChars = 350
const maxRelevantImportChunks = 3
const maxImportChunkTokens = 650

const fileRegex = /\b[\w./\\-]+\.(lua|js|ts|tsx|jsx|json|rs|toml|md|css|html|sql)\b/g

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function extractFiles(text: string): string[] {
  const matches = text.match(fileRegex) ?? []
  return [...new Set(matches)]
}

function cleanTask(text: string): string {
  let cleaned = normalizeText(text)

  const fillerPatterns = [
    /\bcan you\b/gi,
    /\bplease\b/gi,
    /\bidk\b/gi,
    /\bmaybe\b/gi,
    /\bactually\b/gi,
    /\bkinda\b/gi,
    /\bsort of\b/gi,
    /\bi think\b/gi,
    /\bi guess\b/gi
  ]

  for (const pattern of fillerPatterns) {
    cleaned = cleaned.replace(pattern, "")
  }

  return normalizeText(cleaned)
}

function extractConstraints(text: string): string[] {
  const rules: string[] = []
  const lower = text.toLowerCase()

  if (lower.includes("don't rewrite") || lower.includes("dont rewrite") || lower.includes("do not rewrite")) {
    rules.push("Do not rewrite unrelated code.")
  }

  if (lower.includes("diff only")) {
    rules.push("Return a diff only.")
  }

  if (lower.includes("don't scan") || lower.includes("dont scan") || lower.includes("do not scan")) {
    rules.push("Do not scan unrelated files unless required.")
  }

  if (lower.includes("keep it short") || lower.includes("brief") || lower.includes("concise")) {
    rules.push("Keep the explanation short.")
  }

  if (lower.includes("camelcase")) {
    rules.push("Use camelCase names.")
  }

  return [...new Set(rules)]
}

function formatList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n")
}

function getKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_./\\-]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3)

  const aliases: Record<string, string[]> = {
    error: ["exception", "traceback", "stack", "failed"],
    bug: ["error", "issue", "broken", "fix"]
  }

  const keywords = new Set(words)

  for (const word of words) {
    for (const alias of aliases[word] ?? []) {
      keywords.add(alias)
    }
  }

  return keywords
}

function scoreText(text: string, keywords: Set<string>): number {
  const lower = text.toLowerCase()
  let score = 0

  for (const keyword of keywords) {
    if (lower.includes(keyword)) {
      score++
    }
  }

  return score
}

function formatSessionContext(session: SessionData | undefined, taskText: string): string {
  if (!session) return ""

  const keywords = getKeywords(taskText)

  const entries = [
    ...(session.project ? [`Project: ${session.project}`] : []),
    ...session.summary.map((text) => `Summary: ${text}`),
    ...session.decisions.map((text) => `Decision: ${text}`)
  ]

  const ranked = entries
    .filter((entry) => entry.length <= maxMemoryEntryChars)
    .map((entry) => ({
      entry,
      score: entry.startsWith("Project:") ? 999 : scoreText(entry, keywords)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  const selected: string[] = []

  for (const item of ranked) {
    const next = [...selected, `- ${item.entry}`].join("\n")

    if (countTokens(next) > maxSessionTokens) break

    selected.push(`- ${item.entry}`)
  }

  return selected.join("\n")
}

function formatRelevantImports(session: SessionData | undefined, taskText: string): string {
  if (!session || session.imports.length === 0) return ""

  const keywords = getKeywords(taskText)

  const rankedChunks = session.imports
    .flatMap((imported) =>
      imported.chunks.map((chunk) => ({
        label: imported.label,
        chunk,
        score: scoreText(`${chunk.tags.join(" ")}\n${chunk.text}`, keywords)
      }))
    )
    .filter((item) => item.score > 0)
    .filter((item) => item.chunk.tokens <= maxImportChunkTokens)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRelevantImportChunks)

  if (rankedChunks.length === 0) return ""

  return rankedChunks
    .map((item) => {
      return [
        `Source: ${item.label}`,
        item.chunk.text
      ].join("\n")
    })
    .join("\n\n---\n\n")
}

export function preprocessPrompt(options: PreprocessOptions): ProcessResult {
  const rawPrompt = options.rawPrompt
  const mode = options.mode ?? options.session?.mode ?? "code"

  const normalized = normalizeText(rawPrompt)
  const task = cleanTask(normalized)

  const sessionFiles = options.session?.files ?? []
  const promptFiles = extractFiles(normalized)
  const files = [...new Set([...sessionFiles, ...promptFiles])]

  const sessionRules = options.session?.rules ?? []
  const presetRules = getPresetRules(mode)
  const promptRules = extractConstraints(normalized)
  const rules = [...new Set([...sessionRules, ...presetRules, ...promptRules])]

  const output = getPresetOutput(mode)
  const sessionContext = formatSessionContext(options.session, normalized)
  const relevantImports = options.includeImports
    ? formatRelevantImports(options.session, normalized)
    : ""

  const sections: string[] = []

  if (sessionContext) {
    sections.push(`SESSION CONTEXT:\n${sessionContext}`)
  }

  if (relevantImports) {
    sections.push(`RELEVANT IMPORTED CONTEXT:\n${relevantImports}`)
  }

  sections.push(`CURRENT TASK:\n${task || "No task provided."}`)

  if (files.length > 0) {
    sections.push(`FILES:\n${formatList(files)}`)
  }

  if (rules.length > 0) {
    sections.push(`RULES:\n${formatList(rules)}`)
  }

  sections.push(`OUTPUT:\n${formatList(output)}`)

  const processedPrompt = sections.join("\n\n")

  const inputTokens = countTokens(rawPrompt)
  const outputTokens = countTokens(processedPrompt)
  const sessionTokens = countTokens([sessionContext, relevantImports].filter(Boolean).join("\n\n"))
  const netChangeTokens = outputTokens - inputTokens
  const savedTokens = inputTokens - outputTokens

  const reductionPercent = inputTokens > 0
    ? Number(((savedTokens / inputTokens) * 100).toFixed(2))
    : 0

  return {
    rawPrompt,
    processedPrompt,
    inputTokens,
    outputTokens,
    sessionTokens,
    netChangeTokens,
    reductionPercent
  }
}

export function isTooLargeForMemory(text: string): boolean {
  return text.trim().length > maxMemoryEntryChars
}