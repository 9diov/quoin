export type Document = {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
};
