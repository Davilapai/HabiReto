---
trigger: always_on
description: Use Graphify as a compact architectural map when a project graph exists.
---

# Graphify — Project Knowledge Graph

## At task start

- Check whether `graphify-out/graph.json` exists.
- For codebase and architecture questions, query the graph before broad file exploration.
- Prefer focused `query`, `path` and `explain` operations.
- If the graph does not exist, do not query it. Inspect only the files relevant to the task.
- Do not build a graph for an empty or non-indexable repository.

## At task completion

- Update the graph when changes affect architecture, module relationships, interfaces, dependencies or data models.
- Do not update it for trivial local changes.
- Use incremental extraction only when a valid graph already exists.
- If no graph exists, initialize it when sufficient project content is available.
- Never claim an update succeeded without verifying the result.

## Context efficiency

- Prefer graph queries and targeted symbol navigation over broad repository reads.
- Avoid dumping the full graph report unless necessary.
- Do not run full semantic extraction or regenerate visualizations without a concrete reason.
