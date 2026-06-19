/**
 * @quoin-terms Document, Property, Core
 * @quoin-docs docs/design/GLOSSARY.md
 */

export type Document = {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
};
