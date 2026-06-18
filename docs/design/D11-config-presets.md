# D11 — Configuration Presets

## Status

Draft.

## Problem

Quoin's Node CLI configuration is growing. [D10](D10-node-cli-markdown-link-resolution.md)
adds three resolver knobs aimed at users who validate an Obsidian vault in
CI. Future Integration-shaped behaviors are likely — type-declaration key
defaults, binding conventions, scaffolding policies, others not yet
designed — and each will face the same question: should there be a
subsystem-local preset (`resolver.preset`, `bindings.preset`, etc.) or a
single top-level switch?

Subsystem-local presets fragment the surface. A user who validates an
Obsidian vault has to know each subsystem's preset name, set them in lockstep,
and keep them aligned over time. The "I'm validating an Obsidian vault"
intent is one concept, but the configuration repeats it.

Quoin should let users express that intent once, at the top level, and have
it expand to settings across whichever subsystems care.

## Goals

- One named knob expresses a coherent target environment (e.g. "an Obsidian
  vault") and configures every subsystem that needs to know.
- Subsystem-level config remains the source of truth; presets are a
  shorthand that expands to subsystem values.
- Explicit subsystem fields always win over preset values — presets never
  trap a user inside a default they cannot escape.
- Presets are listed and described in one place, so users know what each
  one actually does without reading every subsystem's docs.
- New subsystems can opt into existing presets without changing the preset
  contract.

## Non-goals

- User-defined presets in this phase. Quoin ships a fixed set of named
  presets; users compose behavior by mixing a preset with explicit fields,
  not by authoring their own preset names.
- Per-file / per-directory preset overrides. The preset applies to the
  whole Quoin invocation.
- Presets at the Core layer. Presets are a configuration-shell concern;
  the Core sees only resolved subsystem values.
- A general plugin or extension system. Presets are a config convenience,
  not a programmatic hook.

## Decision

Introduce a top-level `preset` key in the Node CLI configuration. Its value
is the name of a built-in preset that expands to a partial configuration
across whichever subsystems the preset chooses to touch.

```jsonc
{
  "preset": "obsidian-compatible",
  "resolver": {
    "markdownLinkShortestPathFallback": false
  }
}
```

When loading the config:

1. Start from built-in defaults.
2. If `preset` is set, deep-merge the named preset's expansion on top of
   defaults.
3. Deep-merge the user's explicit fields on top of that.

Unknown preset names fail config validation with a clear error listing
known names.

A preset is internally a partial `NodeCliConfig` literal:

```typescript
type PresetName = 'obsidian-compatible';

type Preset = {
  description: string;
  config: DeepPartial<NodeCliConfig>;
};

const PRESETS: Record<PresetName, Preset> = {
  'obsidian-compatible': {
    description:
      'Resolve markdown-link targets the way Obsidian does, so CI validation matches editor behavior.',
    config: {
      resolver: {
        markdownLinkExtensionFallback: true,
        markdownLinkPercentDecode: true,
        markdownLinkShortestPathFallback: true,
      },
    },
  },
};
```

A subsystem-local `preset` field (e.g. `resolver.preset`) is **not** part
of this design. If a user wants only the resolver portion of an
Obsidian-shaped configuration, they apply the top-level preset and override
the non-resolver fields. Presets are intentionally coarse.

## Available Presets

Initial set:

- `obsidian-compatible` — apply the three [D10](D10-node-cli-markdown-link-resolution.md)
  resolver knobs that align markdown-link resolution with Obsidian's
  resolver behavior.

Future presets are added only when at least two subsystems need to vary
together for a real user-facing target environment. Speculative presets
(`hugo`, `docusaurus`, `vitepress`) are out of scope until a concrete need
emerges.

## Composition Rules

### Deep merge, not shallow

Preset expansion deep-merges into config. A preset that sets
`resolver.markdownLinkPercentDecode: true` does not overwrite the user's
`resolver.markdownLinkExtensionFallback: false` set in the same config.

### Explicit fields always win

```jsonc
{
  "preset": "obsidian-compatible",
  "resolver": {
    "markdownLinkShortestPathFallback": false
  }
}
```

The preset turns the shortest-path fallback on; the user's explicit `false`
turns it back off. No special "force-preset" mechanism — users opt out by
naming the field.

### Single preset per config

Configs declare exactly zero or one preset. Stacking multiple presets is
not supported in this phase; it raises ordering questions that lack a
clean default answer.

### No nesting

Presets cannot reference other presets. A preset's expansion is a literal
partial config, not a recursive structure.

## CLI Surface

`--preset <name>` flag at the top level. Maps to the same precedence:

1. Built-in defaults.
2. Config file `preset` (if set).
3. CLI `--preset` flag (overrides config file `preset`).
4. Config file explicit subsystem fields.
5. CLI subsystem flags (override explicit config fields).

A CLI invocation like:

```sh
quoin validate --preset obsidian-compatible --no-resolver-markdown-link-shortest-path-fallback
```

applies the Obsidian preset and turns one knob back off.

`--preset none` (or omitting the flag) reverts to defaults regardless of
what the config file said. This lets users disable a preset for one CI
run without editing the config file.

A discovery command surfaces what each preset does:

```sh
quoin presets list
quoin presets show obsidian-compatible
```

The `show` output renders the resolved partial config so users can see
exactly what the preset turns on.

## Diagnostics

When config validation fails because of an unknown preset name, the error
includes the list of known names:

```
config: unknown preset "obsidian". Known presets: obsidian-compatible.
```

When a preset is applied, no diagnostic is emitted by default. A `--verbose`
or `--explain-config` flag (existing surface in D5 or a follow-on) can
render the effective config after preset expansion, including which fields
came from the preset versus explicit user input. Tracking provenance is a
debugging convenience, not a normal-path concern.

## Subsystem Author Contract

A subsystem participates in presets by exposing its configuration as a
typed substructure of `NodeCliConfig`. A preset author then sets the
desired subsystem fields in the preset's `config` literal. There is no
preset-aware code inside subsystems — they read their resolved
configuration and behave accordingly, unaware that a preset contributed.

This keeps presets a pure configuration-shell concern. Adding a new
subsystem-level setting that a preset wants to touch is a config-shape
change, not a preset-system change.

## Interaction With D10

[D10](D10-node-cli-markdown-link-resolution.md) currently specifies a
`resolver.preset: 'obsidian-compatible'` field and a
`--resolver-preset` flag. Both are subsumed by this design.

Update D10's preset section to point at D11 and drop the
subsystem-local preset shape. The three resolver knobs themselves remain
unchanged.

## Compatibility

- Configs without a `preset` field continue to behave exactly as today.
- Adding `preset` to `NodeCliConfig` is additive; existing configs parse
  unchanged.
- The CLI `--preset` flag is new; no existing flag changes meaning.
- The `quoin presets list` and `quoin presets show` commands are new and
  optional; they do not affect existing commands.

## Open Questions

1. **User-defined presets.** Should users be able to declare named presets
   inside their config (e.g. `presets: { "my-vault": { ... } }`) and apply
   them with `preset: "my-vault"`?

   Recommendation: defer. The current friction is "I keep repeating the
   same handful of settings"; that's solved by built-in presets. User-named
   presets are useful for organizations sharing config snippets, but they
   raise resolution questions (config-file presets vs CLI `--preset`) that
   are easier to design once a concrete need lands.

2. **Preset metadata in JSON output.** Should `quoin validate --json`
   include the active preset name and the resolved effective config in its
   output?

   Recommendation: yes, under `effectiveConfig`, alongside the existing
   serialized config. Provenance (preset vs explicit) is a separate
   follow-on and not required for the initial release.

3. **Versioned presets.** If `obsidian-compatible` later needs to change
   what it expands to, do existing configs get the new expansion silently?

   Recommendation: yes by default — that is the point of a moving target
   like "Obsidian-compatible." If users need stability they pin the
   underlying booleans explicitly. If a preset's meaning changes
   substantially, ship a renamed preset (`obsidian-compatible-v2`) and
   leave the old name in place.

4. **Preset name conventions.** `obsidian-compatible` is verbose. Is the
   shorter `obsidian` better?

   Recommendation: keep `compatible`. The suffix communicates that this is
   a best-effort match, not a promise that Obsidian's actual resolver is
   bundled. The verbosity is worth the calibration.

## Consequences

Positive:

- Users express target environment once, at the top level.
- Adding a new subsystem-level setting that should be Obsidian-shaped is a
  one-line change in a single preset literal.
- The subsystem surface stays focused on its own concerns; preset logic
  lives entirely in the configuration-shell layer.
- Discovery commands (`presets list`, `presets show`) make the
  configuration self-documenting.

Costs:

- A second mechanism for setting configuration (explicit field vs preset),
  with merge precedence the user has to know.
- Presets become a versioning surface — changing what
  `obsidian-compatible` expands to can affect every user's run.
- Tooling that introspects `NodeCliConfig` shape needs to either resolve
  presets first or be aware that the raw config may be partial relative to
  the effective config.
