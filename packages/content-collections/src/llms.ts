/**
 * `@figatellultimate/content-collections/llms`: a page's Markdown for LLMs, from its MDX source, what llms.txt links
 * (`llmsTxtOf` of `@figatellultimate/site` writes the file).
 *
 *     MDX source ──> remark (MDX, GFM) ──> mdast ──> leave out: ESM, expressions, comments, <llm-exclude>
 *                                                ──> a component: mapped to Markdown by the app, else its content
 *                                                ──> Markdown (remark-stringify)
 *
 * Key design decisions:
 *     - Parsed as MDX, not read as text, as chosen with the user: a code block or a code span is a node of its own,
 *       so that a tag, an import or a component shown in code is kept as written, never applied.
 *     - Components handled as the app renders them: it maps a component to Markdown (`components`, as its MDX
 *       `components` map them to React), its props given (literal values only: anything else has no value before
 *       the app runs) and its content already converted; an unmapped component is its content, a self-closing one
 *       nothing. Rejected: the mapping in `figatellultimate.config.ts`, whose functions the generated code, which an
 *       app imports instead of the config, could not carry.
 *     - A mapped component's content converted from its own source, nested components included: the same function,
 *       on the source between its tags.
 *     - Here, in the adapter of the MDX tool, never in `@figatellultimate/site`, whose helpers have no dependency.
 *     - The rest as the author wrote it, through remark: GitHub's tables, code blocks and their meta, the typography.
 *
 * Invariants (`llms.test.ts`): `<llm-exclude>`, ESM, expressions and comments left out; code kept as written; an
 * unmapped component its content, a mapped one its Markdown, its literal props read, nested ones converted first;
 * tables, meta and typography kept.
 *
 * Limitations: a prop whose value is not a literal (a variable, a call, a spread) is left out of `props`.
 */
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

/** A component's props as written in the content: literal values only. */
export type LlmsProps = Readonly<Record<string, unknown>>;

/** A component written as Markdown: from its props and its content, already Markdown. */
export type LlmsComponent = (props: LlmsProps, content: string) => string;

/** How a page's Markdown is written. */
export interface LlmsMarkdownOptions {
  /** The app's components as Markdown, by name (`Callout`); one left out is its content. */
  readonly components?: Readonly<Record<string, LlmsComponent>> | undefined;
}

/** The part of an mdast node this module reads and writes: structural, so that no cast is needed. */
interface MdNode {
  readonly type: string;
  readonly name?: string | null | undefined;
  readonly value?: unknown;
  readonly attributes?: readonly MdAttribute[] | undefined;
  readonly position?:
    | {
        readonly start: { readonly offset?: number | undefined };
        readonly end: { readonly offset?: number | undefined };
      }
    | undefined;
  children?: MdNode[] | undefined;
}

interface MdAttribute {
  readonly type: string;
  readonly name?: string | undefined;
  readonly value?:
    string | null | { readonly value: string; readonly data?: { readonly estree?: unknown } | undefined } | undefined;
}

const EXCLUDE = 'llm-exclude';
const LEFT_OUT = new Set(['mdxjsEsm', 'mdxFlowExpression', 'mdxTextExpression']);
const isJsx = (node: MdNode): boolean => node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';

/** A field of an unknown estree node. */
const field = (node: unknown, key: string): unknown =>
  typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined;

/** Not a literal: a value only the app's code has. */
const UNKNOWN = Symbol('unknown');

/**
 * An expression's value when it is a literal: a string, number, boolean or null, a template without placeholders, a
 * negative number, an array or an object of literals.
 */
function literal(node: unknown): unknown {
  switch (field(node, 'type')) {
    case 'Literal':
      return field(node, 'value');
    case 'TemplateLiteral': {
      const quasis = field(node, 'quasis');
      const expressions = field(node, 'expressions');

      return Array.isArray(quasis) && Array.isArray(expressions) && expressions.length === 0 && quasis.length === 1
        ? field(field(quasis[0], 'value'), 'cooked')
        : UNKNOWN;
    }
    case 'UnaryExpression': {
      const value = literal(field(node, 'argument'));

      return field(node, 'operator') === '-' && typeof value === 'number' ? -value : UNKNOWN;
    }
    case 'ArrayExpression': {
      const elements = field(node, 'elements');
      const values = Array.isArray(elements) ? elements.map(literal) : [UNKNOWN];

      return values.includes(UNKNOWN) ? UNKNOWN : values;
    }
    case 'ObjectExpression': {
      const properties = field(node, 'properties');
      const entries = (Array.isArray(properties) ? properties : [undefined]).map((property): [unknown, unknown] => {
        const key = field(property, 'key');
        const name = field(key, 'type') === 'Identifier' ? field(key, 'name') : field(key, 'value');

        return field(property, 'type') === 'Property' &&
          field(property, 'computed') === false &&
          typeof name === 'string'
          ? [name, literal(field(property, 'value'))]
          : [UNKNOWN, UNKNOWN];
      });

      return entries.some(([key, value]) => key === UNKNOWN || value === UNKNOWN)
        ? UNKNOWN
        : Object.fromEntries(entries);
    }
    default:
      return UNKNOWN;
  }
}

/** A JSX attribute's expression, from its estree program: its first statement's expression. */
const expressionOf = (estree: unknown): unknown => {
  const body = field(estree, 'body');

  return Array.isArray(body) ? field(body[0], 'expression') : undefined;
};

/** A component's literal props: a string, `true` for a name alone, a literal expression's value. */
function propsOf(node: MdNode): LlmsProps {
  const props: Record<string, unknown> = {};

  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== 'mdxJsxAttribute' || attribute.name === undefined) continue;

    const { value } = attribute;
    const read =
      value === null || value === undefined
        ? true
        : typeof value === 'string'
          ? value
          : literal(expressionOf(value.data?.estree));

    if (read !== UNKNOWN) props[attribute.name] = read;
  }

  return props;
}

/** A text node's text. */
const textOf = (node: MdNode | undefined): string | undefined =>
  node?.type === 'text' && typeof node.value === 'string' ? node.value : undefined;

/**
 * Children after what was left out: neighbouring texts as one, the spaces doubled where something was taken out as
 * one, and, in a paragraph or a heading, no space left at its ends.
 */
function joined(children: readonly MdNode[], trimmed: boolean): MdNode[] {
  const out: MdNode[] = [];

  for (const child of children) {
    const before = textOf(out.at(-1));
    const text = textOf(child);

    if (before !== undefined && text !== undefined)
      out.splice(-1, 1, { type: 'text', value: `${before}${text}`.replaceAll(/ {2,}/g, ' ') });
    else out.push(child);
  }

  const first = textOf(out[0]);
  const last = textOf(out.at(-1));

  if (trimmed && first !== undefined) out.splice(0, 1, { type: 'text', value: first.trimStart() });

  if (trimmed && last !== undefined) out.splice(-1, 1, { type: 'text', value: (textOf(out.at(-1)) ?? last).trimEnd() });

  return out;
}

/**
 * The tree for LLMs, in place: ESM, expressions and `<llm-exclude>` gone, every component its Markdown or its content.
 *
 * @param source - The source the tree was parsed from: a mapped component's content is converted from its slice.
 * @param components - The app's components as Markdown.
 */
function forLlms(source: string, components: Readonly<Record<string, LlmsComponent>>): (tree: MdNode) => void {
  const visit = (parent: MdNode): void => {
    if (parent.children === undefined) return;

    parent.children = parent.children.flatMap((node): MdNode[] => {
      if (LEFT_OUT.has(node.type) || (isJsx(node) && node.name === EXCLUDE)) return [];

      const component = isJsx(node) && typeof node.name === 'string' ? components[node.name] : undefined;

      if (component !== undefined) {
        const first = node.children?.[0]?.position?.start.offset;
        const last = node.children?.at(-1)?.position?.end.offset;
        const content =
          first === undefined || last === undefined
            ? ''
            : llmsMarkdownOf(source.slice(first, last), { components }).trimEnd();

        return [{ type: 'html', value: component(propsOf(node), content) }];
      }

      visit(node);

      return isJsx(node) ? (node.children ?? []) : [node];
    });
    parent.children = joined(parent.children, parent.type === 'paragraph' || parent.type === 'heading');
  };

  return visit;
}

/**
 * A page's Markdown for LLMs, from its MDX source.
 *
 * @param source - The page's MDX, its frontmatter apart (a generated entry's `body`).
 * @param options - `components`: the app's components as Markdown, by name.
 * @returns Its Markdown: `<llm-exclude>`, ESM, expressions and comments left out; each component its Markdown (mapped)
 *   or its content; code, tables and typography as written. One final newline.
 *
 * @example
 * llmsMarkdownOf(entry.body, { components: { Callout: ({ type }, content) => `> **${String(type)}:** ${content}` } });
 */
export function llmsMarkdownOf(source: string, options: LlmsMarkdownOptions = {}): string {
  const written = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkGfm)
    .use(() => forLlms(source, options.components ?? {}))
    .use(remarkStringify, { bullet: '-', fences: true, rule: '-', emphasis: '_' })
    .processSync(source);

  return `${String(written).trimEnd()}\n`;
}
