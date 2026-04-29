export type PromptMode = "code" | "debug" | "explain" | "design"

export type ImportSource = "codex" | "chatgpt" | "file" | "manual"

export interface RecentTurn {
  raw: string
  processed: string
  inputTokens: number
  outputTokens: number
  createdAt: string
}

export interface ImportedChunk {
  id: string
  text: string
  tokens: number
  tags: string[]
}

export interface ImportedContext {
  id: string
  label: string
  source: ImportSource
  chunks: ImportedChunk[]
  createdAt: string
}

export interface SessionData {
  name: string
  project?: string
  mode: PromptMode

  // Small, durable memory only. Do not store giant pasted sessions here.
  summary: string[]

  files: string[]
  rules: string[]
  decisions: string[]

  // Large imported reference material. Not injected by default.
  imports: ImportedContext[]

  recentTurns: RecentTurn[]
  createdAt: string
  updatedAt: string
}

export interface ProcessResult {
  rawPrompt: string
  processedPrompt: string
  inputTokens: number
  outputTokens: number
  sessionTokens: number
  netChangeTokens: number
  reductionPercent: number
}