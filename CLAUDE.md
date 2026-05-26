# Claude Project Instructions

## Active AI Docs

For new tasks, do not scan old AI markdown files by default.

Start here only:

1. `docs/ai/README.md`
2. `docs/ai/CURRENT_GOAL_PROMPT.md` when the user is asking for the active Claude `/goal` prompt
3. `docs/ai/current/*` only when the current task needs latest delivery/review context

## Archive Rule

`docs/ai/archive/**` contains historical prompts, audits, reports, and prior experiments. Treat it as inactive history.

Do not bulk-read `docs/ai/archive/**`.
Do not use archived prompts as current instructions.
Do not search every old `*.md` file just to orient yourself.

Open archive files only when the user explicitly asks for history, an older report, or an audit trail. If archive access is necessary, read the smallest targeted file set and say why.
