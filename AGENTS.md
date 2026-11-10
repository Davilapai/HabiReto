# HabiReto — Agent Instructions

## 1. Core principles

- Understand the existing project before making changes.
- Prefer the smallest correct solution.
- Follow Ponytail: minimize code, complexity, abstractions and dependencies.
- Do not sacrifice correctness, security, validation or error handling for brevity.
- Reuse existing patterns unless there is a concrete reason not to.
- Do not perform unrelated refactors.
- Never invent files, APIs, dependencies, requirements or test results.

## 2. Context efficiency

- Minimize token usage, tool calls and unnecessary file reads.
- Prefer targeted searches and symbol-level navigation over reading entire files.
- Use existing project documentation and Graphify before broad repository exploration.
- Do not repeat information already established in the conversation.
- Keep command output concise.
- Load skills and external documentation only when relevant.

## 3. RTK — Token-efficient command execution

- Use RTK for supported terminal commands whenever the Antigravity hook is available.
- Submit normal commands without manually adding the `rtk` prefix.
- Let the Antigravity PreToolUse hook rewrite supported commands automatically.
- Do not bypass the hook or manually invoke RTK unless troubleshooting.
- If a command fails because RTK is unavailable, inspect the executable and PATH before retrying.
- RTK executable:
  `/home/davilapai/.local/bin/rtk`
- Never claim token savings without checking `rtk gain`.

## 4. Graphify

At task start:
- Identify the project root.
- Check whether `graphify-out/graph.json` exists.
- If it exists, query the graph first for codebase and architecture questions.
- Use focused queries, paths and explanations instead of dumping the entire graph.
- If it does not exist, inspect the relevant source files. Do not attempt graph queries against a missing graph.

At task completion:
- Update Graphify after changes that affect architecture, module relationships, interfaces, dependencies or data models.
- Do not rebuild the graph for trivial local changes.
- Use incremental updates when an existing graph is available.
- If no graph exists, initialize it only when sufficient indexable project content is available.
- Prefer `graphify update` for existing graphs and avoid unnecessary full extractions.
- Never claim the graph was updated unless the operation succeeded.

## 5. Engineering workflow

- Inspect the relevant implementation before editing.
- Use Serena for semantic symbol lookup, references and targeted code navigation when available.
- Use Context7 for current external library documentation when needed.
- Avoid loading entire documentation sets when a focused lookup is sufficient.
- Keep changes scoped to the requested task.
- Do not add dependencies without justification.

## 6. Python quality

- Use Pyright for static type checking whenever Python code is involved.
- Pyright is installed globally through mise at:
  `/home/davilapai/.local/share/mise/installs/node/26.5.0/bin/pyright`
- Invoke Pyright using its absolute path because the agent's PATH may not include mise.
- Verify that the executable is accessible before running it.
- Follow the project's configured Python version and type-checking settings.
- Run Pyright on relevant Python files after modifying Python code.
- Resolve reported type errors; do not introduce broad suppressions to hide them.
- Never claim a check succeeded unless it actually completed successfully.

## 7. Validation

- Identify and run the most relevant tests after changes.
- Run applicable linters, formatters and type checks.
- If a check cannot run, explain why.
- Never report a check as passed unless it was actually executed successfully.
- Prioritize validation relevant to the files and behavior changed.
- Do not run unrelated or redundant checks.
- Report the exact command and result when a relevant validation fails.

## 8. Git discipline

- Do not commit, push, reset, rebase or discard user changes unless explicitly requested.
- Inspect the working tree before making changes.
- Do not modify unrelated files.

## 9. Completion report

At the end of each task, report:
- What changed.
- Which validations were executed and their results.
- Whether Graphify was queried or updated.
- Any unresolved issue or limitation.