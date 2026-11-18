# Release documentation rules

Never name or identify a custom recipe provider in public documentation. This rule applies to release notes, GitHub release descriptions, the README, and every file under `docs/`.

Use generic terms such as **custom web provider**, **custom recipe**, or **provider model picker**. Describe the behavior, the affected workflow, and the fix. Omit provider names, brand variants, domains, recipe IDs, account identifiers, and screenshots or examples that identify a custom provider.

Before committing documentation, review the full diff and search the README and `docs/` for custom provider identifiers and their spelling variants. Before creating a release tag, repeat that check against the exact commit the tag will point to. Before publishing on GitHub, review the complete release description and any linked or embedded examples. Correct any identifying reference before proceeding.
