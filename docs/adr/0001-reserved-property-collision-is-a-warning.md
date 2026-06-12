# Reserved property collision is a warning, not an error

When a Type Definition Document declares a Property whose key matches a Reserved Property for the active Integration (e.g. `tags` in Obsidian), Validation emits a warning rather than a hard error. Users may intentionally constrain reserved keys — for example, enforcing that `tags` is always non-empty. A hard error would make that impossible.

## Design Principle Violation

**DP6 — Warning instead of error for a contract-boundary collision**

DP6 requires that authoring contract violations be unambiguous errors: "Loose input at the contract level is a bug." A reserved-property collision is an unambiguous structural conflict between a schema declaration and a key with fixed Integration-defined semantics, yet this ADR downgrades it to a non-blocking warning. The stated rationale — that users may intentionally constrain reserved keys — is valid, but it argues for a different contract design (explicit opt-in syntax) rather than for tolerating the collision silently.
