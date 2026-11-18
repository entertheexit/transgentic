# Custom recipe implementation rules

Keep shared code provider-neutral. Never hardcode a custom provider's name, domain, recipe ID, account, model ID, or selectors in application code, tests, or build scripts.

Implement shared capabilities through the custom recipe orchestrator. Recipes declare provider-specific behavior such as model discovery, mode activation, attachments, submission, and response extraction. When a recipe needs a capability the orchestrator cannot express, extend the shared recipe schema and implementation using provider-neutral fields. Test the capability with a synthetic recipe and generic identifiers.

Develop custom provider recipes and keep provider-specific verification notes under `workspace/`, which is Git-ignored. Never force-add those files or include them in release artifacts. Before committing, review the staged diff for custom provider identifiers and files from `workspace/`.

Follow the [release documentation rules](docs/releases/README.md) for public documentation and release notes.
