# `link` primitive split into `wiki-link` and `url`

Status: Superseded by [P27 — Remove `url` Primitive Type](../plan/P27-remove-url-primitive.md).

The original README defined a single `link` primitive type. We split it into two distinct types — `wiki-link` (`[[...]]`) and `url` (`[text](url)`) — because the two forms have different semantics: Wiki Links are internal references used by Collection Types as Type References, while URLs are external and never constrain Document relationships. Keeping them as one type would require ambiguous validation logic and obscure intent in schemas.

P27 removes `url` again because the spelling was misleading: it accepted Markdown External Link syntax rather than colloquial bare URLs. `wiki-link` remains a primitive because it participates in Link Resolution. External links are modeled as `text` until a future text-refinement mechanism exists.
