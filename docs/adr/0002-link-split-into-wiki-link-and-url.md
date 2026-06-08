# `link` primitive split into `wiki-link` and `url`

The original README defined a single `link` primitive type. We split it into two distinct types — `wiki-link` (`[[...]]`) and `url` (`[text](url)`) — because the two forms have different semantics: Wiki Links are internal references used by Collection Types as Type References, while URLs are external and never constrain Document relationships. Keeping them as one type would require ambiguous validation logic and obscure intent in schemas.
