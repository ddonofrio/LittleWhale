# Little Whale upstream boundary

Little Whale is built from a pinned snapshot of DeepSeek Harness. The upstream
repository remains MIT-licensed and is retained for its generic agent, chat,
Cordis, storage, and provider abstractions. Little Whale product code is
GPL-3.0-or-later and lives in explicit overlay or adapted paths.

Use the package snapshot commands from the repository root:

```text
pnpm upstream:plan --ref <commit-or-tag>
pnpm upstream:sync --ref <immutable-sha> --allow-dirty
pnpm upstream:verify
```

Synchronization works on package snapshots and dependency boundaries. It never
cherry-picks upstream commits. `upstream/lock.yml` records the canonical SHA,
imported package hashes, and the dependency-closure result for the current
checkout. Adapted packages are intentionally left in place and reported for
focused reconciliation.

The initial bootstrap comparison is in `upstream/bootstrap-diff.json`.
