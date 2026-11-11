# HabiReto — Agent Instructions

## 1. Core principles

- Understand the existing project before making changes.
- Document
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

- Use RTK for supported terminal commands when its Antigravity hook works correctly.
- Submit normal commands without manually adding the `rtk` prefix.
- Do not manually invoke RTK when the hook is already responsible for rewriting commands.
- If a command fails with `rtk: command not found` or exit code 127:
  - Stop retrying the same command.
  - Do not assume the PATH is the cause.
  - Check whether the execution environment can access the RTK binary.
  - Do not modify the hook or sandbox configuration without authorization.
  - Report the limitation and provide a host-side command when necessary.
- Do not claim RTK is operational merely because the hook intercepts commands.
- Never claim token savings without checking `rtk gain`.

## 4. Graphify

### Execution environment and binary access
- Graphify is installed in the host user space via `uv tool` as package `graphifyy`.
- Binary location: `~/.local/bin/graphify` or via `uv tool run --from graphifyy graphify`.
- Do not assume `graphify` is directly available inside the sandboxed PATH (`~/.local/` is outside sandbox boundaries).
- If running in a sandboxed environment without direct PATH access:
  - Request elevation (`BypassSandbox: true`) to execute `uv tool run --from graphifyy graphify` or `~/.local/bin/graphify`.
  - Alternatively, if sandbox restrictions block execution, provide the exact command for the user to run on the host.
- Never attempt an incremental update (`--update`) if `graphify-out/graph.json` does not exist yet.

### At task start:
- Identify the project root.
- Check whether `graphify-out/graph.json` exists.
- If it exists, query the graph first for codebase and architecture questions.
- Use focused queries, paths and explanations instead of dumping the entire graph.
- If it does not exist, inspect the relevant source files. Do not attempt graph queries against a missing graph.

### At task completion:
- Update Graphify after changes that affect architecture, module relationships, interfaces, dependencies or data models.
- Do not rebuild the graph for trivial local changes.
- Use incremental updates (`--update`) ONLY when a valid existing graph (`graphify-out/graph.json`) is available.
- If no graph exists, initialize it (`graphify .`) only when sufficient indexable project content is available.
- Avoid full graph extraction when an incremental update is sufficient.
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
- First check whether Pyright is available in the current execution environment.
- Prefer the project's configured development environment when available.
- Do not assume host-installed executables are accessible inside the sandbox.
- If Pyright is unavailable:
  - Do not silently skip type checking.
  - Do not install another copy without authorization.
  - Report the limitation.
  - Provide the exact command for host-side validation when possible.
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

## 10. Financial domain integrity

Financial correctness is a non-negotiable system requirement. The system must never lose or duplicate money.

### Monetary representation
- Never use floating-point types (`float`, `double`) for monetary amounts.
- Use exact representations: 64-bit integers (`BigInteger`) representing base cents, or fixed-point decimals (`Decimal` / `Numeric(18, 2)`).
- Enforce explicit currency (e.g., ISO-4217 `COP`) and precision scales.
- Validate strictly positive amounts for transfers and top-ups ($amount > 0$).
- Reject implicit currency conversions and negative mutation inputs at both schema and model boundaries.

### Concurrency and persistence control
- Concurrency control must be enforced at the persistence layer using strict transactional isolation and explicit row-level locking.
- Prevent deadlocks during multi-account operations by strictly ordering lock acquisition (e.g., always lock the lower `account_id` before the higher `account_id` using `SELECT ... FOR UPDATE`).
- Never rely on application-level or in-memory locks (such as Python's `asyncio.Lock` or `threading.Lock`) for balance mutations; they fail across multiple workers or instances.
- Ensure defense-in-depth: database tables holding balances or ledger tallies must declare a SQL check constraint (e.g., `CHECK (balance >= 0)`) so the persistence layer itself physically rejects negative balances.

### Transactions and idempotency
- All operations affecting accounts, balances, and history must execute within an atomic database transaction.
- A failed operation must roll back completely without partial state changes.
- Every mutating financial operation (transfers, payments, top-ups) must support an `Idempotency-Key` header or parameter backed by an idempotency store. Identical requests must return the original cached response without re-executing ledger operations.
- Never assume an HTTP 200 response alone proves financial consistency; audit transaction logs and balance invariants.

### Ledger and auditability
- Follow an append-only transaction ledger or double-entry model.
- Transaction records must be immutable: never silently update, overwrite, or delete historical entries.
- Adjustments or reversals must be recorded as explicit compensating transactions referencing the original transaction identifier.
- Preserve contextual metadata (e.g., purpose, category, social context) alongside transaction logs.

### Testing financial invariants
- Test standard debit/credit flows, zero-amount rejections, and insufficient-funds conditions.
- Test mid-transaction failure injection: verify that database errors midway through a transfer leave all balances intact.
- Concurrency stress tests must assert the zero-sum balance invariant:
  $$\sum \text{Balances}_{\text{final}} = \sum \text{Balances}_{\text{initial}} + \text{Total Deposits} - \text{Total Withdrawals}$$
  Under parallel bursts, exactly $N$ allowable transactions must succeed and all excess transactions must fail gracefully with zero cents lost or created.

### Scope boundaries
- Simulated top-ups must remain explicitly simulated; never integrate external payment gateways or third-party webhooks unless explicitly instructed.
- Do not introduce financial rules or domain models that have not been established in the core specifications.

## 11. Security, authorization, and challenge scope

- Challenge scope guard: Do not waste time implementing complex authentication schemes (full OAuth2, JWT refresh flows, password reset emails) unless explicitly requested. Use clean identity mocking (e.g., `X-User-Id` header or simple API tokens) to maintain focus on the financial core.
- Enforce boundary authorization: verify that the acting identity owns the source account before any debit or transfer operation.
- Validate all incoming payloads against strict Pydantic/dataclass schemas; never trust client-provided balances, timestamps, or account ownership claims.
- Use parameterized SQL queries exclusively (via SQLAlchemy or equivalent ORM) to prevent SQL injection.
- Never hardcode secrets, private keys, or credentials in codebase files.
- Sanitize error messages: never leak stack traces, database schemas, or internal server state to client responses.

## 12. AI-assisted development and live defense

- Treat all AI-generated code, schemas, and queries as unverified until validated with tests.
- Do not accept architectural compromises or patterns you cannot explain during a code review.
- Actively verify that the AI did not omit database transactions, locks, or error handling in favor of concise code.
- When an AI suggestion introduces subtle concurrency bugs or floating-point arithmetic, correct it explicitly.
- Document key architectural decisions, trade-offs, and edge cases to ensure confident defense during the 60-minute live pair programming and interview session.
- Keep the implementation clean and modular so that sudden live-coding requirement changes can be added without friction.

## 13. Documentation

- All code documentation, comments, docstrings and technical explanations inside source files MUST be written in Spanish.
- Document code directly where it is implemented, not only in external documentation files.
- Every public class, method, function and module MUST have documentation explaining its purpose, responsibilities, parameters, return values and relevant exceptions.
- Document complex algorithms, business rules, non-obvious decisions, edge cases and implementation details with inline comments.
- Explain WHY something is implemented in a particular way rather than simply repeating WHAT the code does.
- Keep documentation synchronized with the implementation. Whenever code changes, update the affected documentation.
- Use the documentation conventions and formats native to the language (Javadoc, JSDoc, Python docstrings, XML documentation, etc.).
- Avoid redundant comments, obvious explanations and excessive documentation that adds noise.
- Do not leave TODOs, FIXMEs or undocumented assumptions without a clear reason.
- Preserve existing documentation unless it is incorrect or outdated.