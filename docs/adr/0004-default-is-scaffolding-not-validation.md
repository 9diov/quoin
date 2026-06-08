# `default` belongs to Scaffolding, not Validation

The `default` constraint on a Property is not evaluated during Validation. Instead, defaults are computed by a separate Scaffolding feature that returns a Scaffolding Result for missing Properties. The Integration applies that result to the Document. Validation is kept strictly read-only — it never writes to Documents. Mixing mutation into Validation would violate the principle of least surprise and make Validation results non-deterministic across repeated runs.
