# Reserved property collision is a warning, not an error

When a Type Definition Document declares a Property whose key matches a Reserved Property for the active Integration (e.g. `tags` in Obsidian), Validation emits a warning rather than a hard error. Users may intentionally constrain reserved keys — for example, enforcing that `tags` is always non-empty. A hard error would make that impossible.
