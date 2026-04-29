# cprep

`cprep` is a TypeScript CLI for session-aware prompt preprocessing. It stores local session state in JSON, turns raw prompts into structured prompts, counts tokens, and can import Codex session logs for later reuse.

## Install

```bash
npm install
```

## Build and run

```bash
npm run build
npm run dev -- <command>
npm run start -- <command>
```

You can also run the built CLI directly:

```bash
node ./dist/cli.js <command>
```

## Session storage

Sessions are stored at:

```text
~/.cprep/sessions/<sessionName>.json
```

On Windows this is usually:

```text
C:\Users\<you>\.cprep\sessions\<sessionName>.json
```

Each session stores:

- `name`
- `project`
- `mode`
- `summary`
- `files`
- `rules`
- `decisions`
- `recentTurns`
- `createdAt`
- `updatedAt`

## Commands

### Create a session

```bash
cprep new <session>
```

Options:

- `--project <name>`
- `--template <mode>`

Example:

```bash
cprep new weedfarm --project "GMod Weed Farm Balance" --template code
```

### Preprocess a prompt

```bash
cprep ask <session> "<prompt>"
```

Options:

- `--mode <mode>`
- `--save-turn`

This prints the processed prompt plus:

- raw input token count
- session context token count
- processed output token count
- difference
- reduction percent

If `--save-turn` is set, the raw and processed prompt are stored in `recentTurns`. Only the latest 10 turns are kept.

Example:

```bash
cprep ask weedfarm "nerf LED but don't increase heat and don't rewrite everything"
```

### Update session memory

```bash
cprep update <session> "<text>"
```

Options:

- `--summary`
- `--decision`
- `--file`
- `--rule`

If no option is provided, the text is saved as a summary.

Examples:

```bash
cprep update weedfarm --summary "Balancing GMod weed farm lamps."
cprep update weedfarm --decision "LED lamp should be nerfed using Power_usage/storage instead of Heat."
cprep update weedfarm --file "lua/zwf/config/sh_lamps.lua"
```

### Show a session

```bash
cprep show <session>
```

Prints:

- session name
- project
- mode
- summary
- files
- rules
- decisions
- updatedAt

### List sessions

```bash
cprep list
```

### Delete a session

```bash
cprep delete <session>
```

### Tokenize text

```bash
cprep tokenize "<text>"
```

Prints the token count.

### Import a transcript or JSONL log

```bash
cprep import <session> [source]
```

If the session does not exist yet, `cprep import` creates it with the imported log as the starting reference context.

If `source` is omitted, `cprep import` reads from stdin.

It accepts:

- plain transcript text
- `cprep ask` output
- Codex `.jsonl` session logs

Examples:

```bash
cprep import weedfarm ".\transcript.txt"
Get-Content .\rollout.jsonl | cprep import weedfarm
```

The importer extracts:

- project
- mode
- summary text
- files
- rules
- decisions
- recent turns from user/assistant pairs when available

For Codex `.jsonl` exports, the importer skips metadata and lifecycle records and keeps only user/assistant message content.

## Supported modes

- `code`
- `debug`
- `explain`
- `design`

## Prompt preprocessing

`cprep` applies light preprocessing before printing the structured prompt:

- normalizes whitespace
- removes filler phrases such as `can you`, `please`, `maybe`, `i think`
- extracts file paths for common source/doc extensions
- extracts simple constraints such as:
  - do not rewrite / don't rewrite / dont rewrite
  - diff only
  - do not scan / don't scan / dont scan
  - keep it short / brief / concise
  - camelCase

## Output shape

Processed prompts are formatted like this:

```text
SESSION CONTEXT:
- Project: ...
- Summary: ...
- Decision: ...

CURRENT TASK:
...

FILES:
- ...

RULES:
- ...

OUTPUT:
- ...
```

Empty sections are omitted except `CURRENT TASK`, `RULES`, and `OUTPUT`.

## Notes

- This repo is Node.js ESM + TypeScript.
- Token counts are estimates from `gpt-tokenizer`.
- The CLI is local only. It does not connect to the live Codex thread.
- `npm run dev -- ...` may print npm flag-forwarding warnings; the CLI still receives the command.
