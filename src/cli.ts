#!/usr/bin/env node

import { Command } from "commander"
import chalk from "chalk"
import {
  createSession,
  deleteSession,
  listSessions,
  loadSession,
  saveSession
} from "./sessionStore.js"
import { preprocessPrompt, isTooLargeForMemory } from "./preprocess.js"
import { countTokens } from "./tokenizer.js"
import { importTextFile } from "./imports.js"
import type { ImportSource, PromptMode } from "./types.js"

const program = new Command()

program
  .name("cprep")
  .description("Session-aware prompt preprocessor")
  .version("0.1.0")

program
  .command("new")
  .description("Create a new session")
  .argument("<session>", "Session name")
  .argument("[rest...]", "Optional args recovered from npm run")
  .option("--project <name>", "Project name")
  .option("--template <mode>", "Preset mode: code, debug, explain, design", "code")
  .action(async (sessionName: string, rest: string[], options: { project?: string; template: string }) => {
    const modeName = options.template || inferModeFromRest(rest) || "code"
    const mode = parseMode(modeName)
    const projectName = options.project || inferProjectFromRest(rest)
    const sessionData = await createSession(sessionName, projectName, mode)

    console.log(chalk.green(`Created session: ${sessionData.name}`))
    if (sessionData.project) console.log(`Project: ${sessionData.project}`)
    console.log(`Mode: ${sessionData.mode}`)
  })

program
  .command("import")
  .description("Import a large reference file into a session without injecting it by default")
  .argument("<session>", "Session name")
  .argument("<file>", "File path to import")
  .option("--source <source>", "Import source: codex, chatgpt, file, manual", "file")
  .option("--label <label>", "Human-readable import label")
  .action(async (
    sessionName: string,
    filePath: string,
    options: { source: string; label?: string }
  ) => {
    const source = parseImportSource(options.source)

    const importedContext = await importTextFile(filePath, source, options.label)

    if (importedContext.chunks.length === 0) {
      console.error(chalk.red("Import file was empty or could not be chunked."))
      process.exit(1)
    }

    let sessionData
    try {
      sessionData = await loadSession(sessionName)
    } catch {
      sessionData = await createSession(sessionName, undefined, "code")
    }

    sessionData.imports.unshift(importedContext)
    await saveSession(sessionData)

    const totalTokens = importedContext.chunks.reduce((sum, chunk) => sum + chunk.tokens, 0)

    console.log(chalk.green("Imported reference context."))
    console.log(`Label: ${importedContext.label}`)
    console.log(`Source: ${importedContext.source}`)
    console.log(`Chunks: ${importedContext.chunks.length}`)
    console.log(`Tokens: ${totalTokens}`)
    console.log(chalk.yellow("\nNote: imported context is not injected by default. Use --with-imports on ask."))
  })

program
  .command("ask")
  .description("Preprocess a prompt using a session")
  .argument("<session>", "Session name")
  .argument("<prompt...>", "Prompt text")
  .option("--mode <mode>", "Override mode: code, debug, explain, design")
  .option("--save-turn", "Save this turn to recentTurns")
  .option("--with-imports", "Search imported reference chunks and include relevant ones")
  .action(async (
    sessionName: string,
    promptParts: string[],
    options: { mode?: string; saveTurn?: boolean; withImports?: boolean }
  ) => {
    const sessionData = await loadSession(sessionName)
    const rawPrompt = promptParts.join(" ")
    const mode = options.mode ? parseMode(options.mode) : sessionData.mode

    const result = preprocessPrompt({
      rawPrompt,
      session: sessionData,
      mode,
      includeImports: Boolean(options.withImports)
    })

    console.log(result.processedPrompt)

    console.log(chalk.bold("\nToken estimate:"))
    console.log(`Raw input tokens: ${result.inputTokens}`)
    console.log(`Session context tokens: ${result.sessionTokens}`)
    console.log(`Processed output tokens: ${result.outputTokens}`)
    console.log(`Net change: ${formatNetChange(result.netChangeTokens)}`)
    console.log(`Reduction percent: ${result.reductionPercent}%`)

    if (options.saveTurn) {
      sessionData.recentTurns.unshift({
        raw: result.rawPrompt,
        processed: result.processedPrompt,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        createdAt: new Date().toISOString()
      })

      sessionData.recentTurns = sessionData.recentTurns.slice(0, 10)
      await saveSession(sessionData)

      console.log(chalk.green("\nSaved turn to session."))
    }
  })

program
  .command("update")
  .description("Update small durable session memory")
  .argument("<session>", "Session name")
  .argument("<text...>", "Text to save")
  .option("--summary", "Save as small durable summary")
  .option("--decision", "Save as small durable decision")
  .option("--file", "Save as file path")
  .option("--rule", "Save as rule")
  .action(async (
    sessionName: string,
    textParts: string[],
    options: {
      summary?: boolean
      decision?: boolean
      file?: boolean
      rule?: boolean
    }
  ) => {
    const sessionData = await loadSession(sessionName)
    const text = textParts.join(" ").trim()

    if (!text) {
      console.error(chalk.red("Nothing to save."))
      process.exit(1)
    }

    const isMemoryWrite =
      options.summary ||
      options.decision ||
      (!options.file && !options.rule)

    if (isMemoryWrite && isTooLargeForMemory(text)) {
      console.error(chalk.red("That text is too large for summary/decision memory."))
      console.error("Use import instead:")
      console.error(chalk.cyan(`cprep import ${sessionName} <file> --source codex --label "Imported context"`))
      process.exit(1)
    }

    if (options.file) {
      addUnique(sessionData.files, text)
      console.log(chalk.green("Saved file."))
    } else if (options.rule) {
      addUnique(sessionData.rules, text)
      console.log(chalk.green("Saved rule."))
    } else if (options.decision) {
      addUnique(sessionData.decisions, text)
      console.log(chalk.green("Saved decision."))
    } else {
      addUnique(sessionData.summary, text)
      console.log(chalk.green("Saved summary."))
    }

    await saveSession(sessionData)
  })

program
  .command("show")
  .description("Show session details")
  .argument("<session>", "Session name")
  .action(async (sessionName: string) => {
    const sessionData = await loadSession(sessionName)

    console.log(chalk.bold(`\nSession: ${sessionData.name}`))
    if (sessionData.project) console.log(`Project: ${sessionData.project}`)
    console.log(`Mode: ${sessionData.mode}`)

    printSection("Summary", sessionData.summary)
    printSection("Files", sessionData.files)
    printSection("Rules", sessionData.rules)
    printSection("Decisions", sessionData.decisions)

    console.log(chalk.bold("\nImports:"))

    if (sessionData.imports.length === 0) {
      console.log("- none")
    } else {
      for (const importedContext of sessionData.imports) {
        const totalTokens = importedContext.chunks.reduce((sum, chunk) => sum + chunk.tokens, 0)
        console.log(`- ${importedContext.label} (${importedContext.source}, ${importedContext.chunks.length} chunks, ${totalTokens} tokens)`)
      }
    }

    console.log(`\nUpdated: ${sessionData.updatedAt}`)
  })

program
  .command("list")
  .description("List sessions")
  .action(async () => {
    const sessions = await listSessions()

    if (sessions.length === 0) {
      console.log("No sessions found.")
      return
    }

    for (const session of sessions) {
      console.log(`- ${session}`)
    }
  })

program
  .command("delete")
  .description("Delete a session")
  .argument("<session>", "Session name")
  .action(async (sessionName: string) => {
    await deleteSession(sessionName)
    console.log(chalk.green(`Deleted session: ${sessionName}`))
  })

program
  .command("tokenize")
  .description("Count tokens for text")
  .argument("<text...>", "Text to tokenize")
  .action((textParts: string[]) => {
    const text = textParts.join(" ")
    console.log(countTokens(text))
  })

async function main(): Promise<void> {
  if (process.argv.length <= 2) {
    program.outputHelp()
    return
  }

  await program.parseAsync(process.argv)
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(chalk.red(error.message))
  } else {
    console.error(chalk.red(String(error)))
  }

  process.exit(1)
})

function parseMode(value: string): PromptMode {
  const validModes: PromptMode[] = ["code", "debug", "explain", "design"]

  if (!validModes.includes(value as PromptMode)) {
    console.error(chalk.red(`Invalid mode: ${value}`))
    console.error(`Valid modes: ${validModes.join(", ")}`)
    process.exit(1)
  }

  return value as PromptMode
}

function parseImportSource(value: string): ImportSource {
  const validSources: ImportSource[] = ["codex", "chatgpt", "file", "manual"]

  if (!validSources.includes(value as ImportSource)) {
    console.error(chalk.red(`Invalid source: ${value}`))
    console.error(`Valid sources: ${validSources.join(", ")}`)
    process.exit(1)
  }

  return value as ImportSource
}

function inferModeFromRest(rest: string[]): string | undefined {
  const lastValue = rest.at(-1)
  if (!lastValue) return undefined

  const validModes: PromptMode[] = ["code", "debug", "explain", "design"]
  return validModes.includes(lastValue as PromptMode) ? lastValue : undefined
}

function inferProjectFromRest(rest: string[]): string | undefined {
  if (rest.length === 0) return undefined

  const lastValue = rest.at(-1)
  const validModes: PromptMode[] = ["code", "debug", "explain", "design"]

  if (lastValue && validModes.includes(lastValue as PromptMode)) {
    if (rest.length === 1) return undefined

    const projectText = rest.slice(0, -1).join(" ").trim()
    return projectText || undefined
  }

  const projectText = rest.join(" ").trim()
  return projectText || undefined
}

function addUnique(list: string[], value: string): void {
  if (!list.includes(value)) {
    list.push(value)
  }
}

function printSection(title: string, items: string[]): void {
  console.log(chalk.bold(`\n${title}:`))

  if (items.length === 0) {
    console.log("- none")
    return
  }

  for (const item of items) {
    console.log(`- ${item}`)
  }
}

function formatNetChange(netChangeTokens: number): string {
  if (netChangeTokens > 0) return chalk.yellow(`+${netChangeTokens}`)
  if (netChangeTokens < 0) return chalk.green(`${netChangeTokens}`)
  return "0"
}
