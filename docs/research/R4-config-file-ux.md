---
_type: "[[research-note]]"
status: "active"
sources:
  - "README.md"
  - "docs/public/index.md"
  - "docs/design/D5-node-cli-integration.md"
  - "src/integration/node-lib/config.ts"
  - "src/integration/node-cli/index.ts"
related:
  - "[[R1-human-readable-cli-output]]"
---

# R4 — Config File UX

## Goal

Review Quoin's current config-file design as a first-time user of the Node CLI and identify the highest-leverage improvements to the file's name, location, discovery behavior, and content model.

## Findings

Quoin's config model is structurally reasonable, but the user experience around it is still too implicit.

The current filename, `quoin.config.jsonc`, is defensible for a dedicated CLI tool, but it reads more like an implementation detail than a polished user-facing interface. It is long, slightly noisy to scan, and not especially ergonomic compared to the config conventions many Node users expect.

The larger issue is not the filename itself, but the mismatch between how the docs frame the file and how the CLI actually treats it.

- The public docs say to create `quoin.config.jsonc` at the project root.
- The implementation actually walks upward from the current working directory until it finds a config file.
- That behavior is useful, but it creates ambiguity in nested docs directories and monorepos unless it is explained much more clearly.

The config parser is also too forgiving in the wrong places.

- `bindings` is validated strictly and throws useful errors.
- Most other fields are parsed leniently and silently ignored when invalid.
- As a result, a user can make a typo or shape error and Quoin will quietly fall back to defaults.

That is poor product behavior for a config file. A config file should either be accepted as valid or rejected with precise feedback. Silent fallback makes the file feel untrustworthy and makes debugging harder than it needs to be.

The config shape also mixes beginner and advanced concerns without enough guidance.

- `bindings` is a likely first-use feature for incremental adoption.
- `typeDeclarationKey` is an advanced compatibility option.
- `output.format` and `resolver.strategy` are even more internal-facing.

Putting all of these fields in one undifferentiated surface makes the config feel heavier than it is. It also exposes internal architecture before the user has learned the basic workflow.

Some fields are premature as public surface area. `resolver.strategy` currently only accepts `basename`, so exposing it in the config suggests meaningful configurability that does not yet exist.

The example config in the public docs is correct, but too abstract. It shows field names, not real adoption paths. A new user would benefit more from a few opinionated example configs that map to actual scenarios:

- adopt Quoin incrementally using bindings only
- use Quoin in a dedicated docs repo
- tighten policy for CI

## Recommendations

### 1. Make config validation strict

Invalid config values should fail loudly with exact field paths and suggested fixes.

Examples:

- wrong scalar vs array shape for `include` or `exclude`
- invalid enum value for `untypedDocumentBehavior`
- invalid type for `referentialValidation`
- unknown top-level keys

The current strictness applied to `bindings` should be extended to the rest of the config surface.

### 2. Make config discovery explicit in both docs and CLI output

Quoin should clearly tell the user which config file was loaded and from where.

Example:

```text
Using config: /repo/docs/quoin.config.jsonc
```

This is especially important when discovery walks upward from the current working directory, because otherwise users can end up editing the wrong file or misunderstanding project scope.

### 3. Separate minimal config from advanced config

The primary docs should lead with the smallest useful config, likely a `bindings`-only example for incremental adoption.

Example:

```jsonc
{
  "bindings": [{ "type": "skill", "match": "skills/**/*.md" }]
}
```

Advanced options like `typeDeclarationKey`, `output`, and future resolver settings should move into a fuller reference section rather than sharing the main onboarding example.

### 4. Trim public knobs that do not buy real user value yet

If a config field has only one meaningful value, it should usually not be presented as a user decision.

`resolver.strategy` is the clearest case. Until Quoin supports more than one real resolver mode, that field should stay internal or at least be excluded from end-user-facing docs.

### 5. Provide opinionated config templates by use case

The docs should include a few named patterns instead of one generic blob.

Recommended presets:

- Docs repo preset
- Incremental adoption preset
- Strict CI preset

This would make the config file feel like a product surface rather than a schema dump.

### 6. Re-evaluate long-term config placement conventions

`quoin.config.jsonc` may still be the right long-term default, but the decision should be treated as a product choice rather than an incidental implementation detail.

If Quoin keeps this filename, it should lean into it with strong tooling and docs. If not, future alternatives could include a shorter rc-style filename or a `quoin` key in `package.json`.

## Sources

- [README.md](../../README.md)
- [docs/public/index.md](../public/index.md)
- [D5 — Node CLI Integration](../design/D5-node-cli-integration.md)
- [src/integration/node-lib/config.ts](../../src/integration/node-lib/config.ts)
- [src/integration/node-cli/index.ts](../../src/integration/node-cli/index.ts)
