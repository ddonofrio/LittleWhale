# Upstream maintenance boundary

Little Whale imports selected components from pinned DeepSeek Harness snapshots. The purpose of this directory is to make that relationship reproducible: upstream code remains identifiable and replaceable, while Little Whale product code remains protected from synchronisation.

For the product rationale and compatibility policy, read [`../UPSTREAM.md`](../UPSTREAM.md).

## Ownership modes

| Mode | Meaning | Synchronisation behaviour |
|---|---|---|
| `upstream-mirror` | Unmodified DeepSeek Harness package | Replaced as a complete package from the pinned snapshot |
| `little-whale` | Code owned by this project | Never overwritten |
| `adapted-upstream` | Upstream-derived package with a documented local change | Preserved and reported for focused reconciliation |
| `excluded` | Component intentionally absent from Little Whale | Never imported |

The authoritative classification is [`manifest.yml`](manifest.yml). [`lock.yml`](lock.yml) records the current canonical SHA, imported package hashes, and dependency closure.

## Commands

```text
pnpm upstream:plan --ref <commit-or-tag>
pnpm upstream:sync --ref <immutable-sha> --allow-dirty
pnpm upstream:verify
```

### Plan

`upstream:plan` performs a read-only package comparison. It reports changed packages, dependency-boundary changes, adapted-package overlap, and product-specific upstream additions that require a decision.

### Synchronise

`upstream:sync` replaces declared mirror packages from one immutable snapshot. It does not cherry-pick commits and does not overwrite Little Whale-owned or adapted paths.

### Verify

`upstream:verify` checks package hashes, ownership boundaries, dependency closure, provenance, and forbidden product composition.

## Maintenance principles

- Treat packages, not individual commits, as the normal update unit.
- Import every package in one update from the same upstream SHA.
- Keep mirrored packages byte-for-byte replaceable.
- Prefer a Little Whale plugin or composition overlay over modifying upstream code.
- Document every unavoidable adapted package.
- Preserve all MIT notices and upstream provenance.
- Review changes to compatibility boundaries; do not review unrelated upstream commit traffic.
