# TypeRegistry resolves Type References for Referential Validation

Referential Validation needs two distinct lookups: resolving a Wiki Link to the target Document, and resolving type names or Type Declarations to Type Definition Documents. A Resolver only answers Document lookup questions, so it cannot tell the Core whether `list<skill>` refers to a known Type Definition Document or whether the linked Document's `_type` declaration resolves to that same Type Definition Document.

We keep Resolver focused on Wiki Link lookup and introduce an Integration-supplied TypeRegistry for Type Definition lookup. The TypeRegistry resolves Type References from schemas by name and resolves Document Type Declarations from frontmatter values. It returns explicit lookup results instead of `null`, so Validation can distinguish missing, malformed, ambiguous, and unavailable type lookups.

Referential Validation compares resolved Type Definition Document identity, not raw Type Reference or Type Declaration strings. This lets Integration-specific matching rules support equivalent declarations such as `[[Skill]]`, `[[types/Skill]]`, or an aliased Wiki Link while keeping the Core comparison simple.

The Core remains pure: Integrations still own all vault/filesystem access, parsing caches, and host-specific type matching behaviour. The Core only consumes the TypeRegistry interface during opt-in Referential Validation.
