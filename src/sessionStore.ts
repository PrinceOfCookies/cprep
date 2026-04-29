import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { z } from "zod"
import type { PromptMode, SessionData } from "./types.js"
import { getPresetRules } from "./presets.js"

const importedChunkSchema = z.object({
  id: z.string(),
  text: z.string(),
  tokens: z.number(),
  tags: z.array(z.string())
})

const importedContextSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: z.enum(["codex", "chatgpt", "file", "manual"]),
  chunks: z.array(importedChunkSchema),
  createdAt: z.string()
})

const sessionSchema = z.object({
  name: z.string(),
  project: z.string().optional(),
  mode: z.enum(["code", "debug", "explain", "design"]),
  summary: z.array(z.string()),
  files: z.array(z.string()),
  rules: z.array(z.string()),
  decisions: z.array(z.string()),
  imports: z.array(importedContextSchema).default([]),
  recentTurns: z.array(z.object({
    raw: z.string(),
    processed: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    createdAt: z.string()
  })),
  createdAt: z.string(),
  updatedAt: z.string()
})

function getBaseDir(): string {
  return path.join(os.homedir(), ".cprep")
}

function getSessionsDir(): string {
  return path.join(getBaseDir(), "sessions")
}

function getSessionPath(name: string): string {
  return path.join(getSessionsDir(), `${name}.json`)
}

export async function ensureStore(): Promise<void> {
  await fs.mkdir(getSessionsDir(), { recursive: true })
}

export async function createSession(
  name: string,
  project?: string,
  mode: PromptMode = "code"
): Promise<SessionData> {
  await ensureStore()

  const now = new Date().toISOString()

  const session: SessionData = {
    name,
    project,
    mode,
    summary: [],
    files: [],
    rules: getPresetRules(mode),
    decisions: [],
    imports: [],
    recentTurns: [],
    createdAt: now,
    updatedAt: now
  }

  await fs.writeFile(getSessionPath(name), JSON.stringify(session, null, 2), "utf8")
  return session
}

export async function loadSession(name: string): Promise<SessionData> {
  await ensureStore()

  const raw = await fs.readFile(getSessionPath(name), "utf8")
  const parsed = JSON.parse(raw)

  // Backwards compatibility for old session files.
  if (!Array.isArray(parsed.imports)) {
    parsed.imports = []
  }

  return sessionSchema.parse(parsed)
}

export async function saveSession(session: SessionData): Promise<void> {
  await ensureStore()

  session.updatedAt = new Date().toISOString()
  await fs.writeFile(getSessionPath(session.name), JSON.stringify(session, null, 2), "utf8")
}

export async function listSessions(): Promise<string[]> {
  await ensureStore()

  const files = await fs.readdir(getSessionsDir())
  return files
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
}

export async function deleteSession(name: string): Promise<void> {
  await fs.rm(getSessionPath(name), { force: true })
}