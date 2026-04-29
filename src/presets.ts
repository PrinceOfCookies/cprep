import type { PromptMode } from "./types.js"

export function getPresetRules(mode: PromptMode): string[] {
  switch (mode) {
    case "debug":
      return [
        "Identify the likely cause first.",
        "Ask for missing files only if required.",
        "Do not rewrite large sections blindly.",
        "Prefer minimal fixes."
      ]

    case "explain":
      return [
        "Explain clearly.",
        "Use examples when useful.",
        "Avoid unnecessary jargon.",
        "Keep it practical."
      ]

    case "design":
      return [
        "Organize into sections.",
        "Include goals, non-goals, architecture, workflow, and MVP.",
        "Keep implementation realistic."
      ]

    case "code":
    default:
      return [
        "Do not rewrite unrelated code.",
        "Prefer small diffs.",
        "Do not scan unrelated files unless required.",
        "Use efficient, readable code.",
        "Use camelCase names.",
        "Keep comments sparse."
      ]
  }
}

export function getPresetOutput(mode: PromptMode): string[] {
  switch (mode) {
    case "debug":
      return [
        "Cause.",
        "Fix.",
        "Patch/diff if possible."
      ]

    case "explain":
      return [
        "Direct explanation.",
        "Small example if useful."
      ]

    case "design":
      return [
        "Markdown design doc."
      ]

    case "code":
    default:
      return [
        "Concise patch/diff.",
        "Brief explanation."
      ]
  }
}