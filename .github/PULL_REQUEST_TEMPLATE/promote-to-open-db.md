## Promotion to open database

This PR **moves or copies** a record from `src/index/` into `src/items/` per project promotion rules.

## Item

- **id**:
- **From**: `src/index/...`
- **To**: `src/items/...`

## Promotion criteria (confirm)

- [ ] Stable `id`, brand, type
- [ ] Canonical official source URL
- [ ] Inner and/or outer geometry present and consistent (`inner` ≤ `outer` where both exist)
- [ ] At least one measurement entry **or** authoritative manufacturer specification documented in `measurements`
- [ ] Evidence/sources aligned with published dimensions
- [ ] Index stub removed if fully promoted (no duplicate id across layers)

## Notes for reviewers

- Risk / uncertainty:
- Follow-up issues:
