# Referential Validation is not transitive

When Referential Validation checks that a linked Document conforms to its declared Type Reference, it validates only that Document's own Properties — it does not recurse into that Document's Wiki Links. Transitive validation produces cascading errors that are hard to trace back to the source, and traversal cost grows unboundedly in large vaults.
