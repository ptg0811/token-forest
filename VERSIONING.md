# Versioning

token-forest follows [Semantic Versioning](https://semver.org) (`MAJOR.MINOR.PATCH`),
driven by [Conventional Commits](https://www.conventionalcommits.org).

## Bump rules

| Commit type | Version bump |
| --- | --- |
| `feat:` | MINOR |
| `fix:`, `deps:` | PATCH |
| `feat!:` / `BREAKING CHANGE:` | MAJOR (pre-1.0: MINOR) |
| `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `build:` | no release |

## Source of truth & tags

- `package.json` `version` is the single source of truth.
- Each release is tagged **`vMAJOR.MINOR.PATCH`** on `main`.
- The bundled menubar app is versioned **separately** with the `menubar-v` prefix — never reuse it for the web app.
- Every release is recorded in `CHANGELOG.md`.

## Release flow

1. Merge feature/fix PRs to `main` with Conventional Commit titles.
2. On release: bump `package.json` `version`, update `CHANGELOG.md`, commit as `chore(release): X.Y.Z`, open PR, merge.
3. Tag the release commit `vX.Y.Z` on `main` and push the tag:
   ```bash
   git tag vX.Y.Z <merge-commit>
   git push origin vX.Y.Z
   ```
