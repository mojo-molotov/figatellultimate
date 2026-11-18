/**
 * Rendering: an in-memory ts-morph project, a module built from declarations then transpiled file by file into
 * JavaScript, declarations, or both; every file starts with the generated header (the writer only ever removes such
 * files).
 */
import { GENERATED_HEADER } from '@figatellu/core';
import { IndentationText, NewLineKind, Project, QuoteKind, ts, type SourceFile } from 'ts-morph';

/** One generated file, path relative to the output folder (POSIX). */
export interface GeneratedFile {
  readonly path: string;
  readonly contents: string;
}

const HEADER = `${GENERATED_HEADER} Do not edit: run \`figatellu build\` instead.\n`;

/**
 * An in-memory ts-morph project (no I/O).
 *
 * @returns A ts-morph project on an in-memory file system, formatted like the generated output.
 */
export function createProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      newLineKind: NewLineKind.LineFeed,
      useTrailingCommas: true,
    },
  });
}

/**
 * What a generated module becomes: `module` (runtime and types: `.js` + `.d.ts`), `types` (declarations only:
 * `.d.ts`), `data` (runtime only, never reached by an app's typecheck: `.js`).
 *
 */
export type Output = 'module' | 'types' | 'data';

const TRANSPILE: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  verbatimModuleSyntax: true,
  isolatedDeclarations: true,
  declaration: true,
};

/**
 * Formats a source with TypeScript's formatter (two spaces). Used for declarations, the files people read; the
 * transpiled JavaScript keeps the printer's layout, since formatting a large index would double the build time.
 */
function formatted(project: Project, path: string, text: string): string {
  const file = project.createSourceFile(path, text, { overwrite: true });

  file.formatText({ indentSize: 2, convertTabsToSpaces: true });
  const result = file.getFullText();

  project.removeSourceFile(file);

  return result;
}

/**
 * Builds a module from declarations (`build`), as TypeScript, then transpiles it file by file into what `output`
 * asks for: no program, so it stays fast and deterministic. Data modules carry no type: they are built
 * directly as JavaScript, without transpilation (one per entry, kept cheap). Every file starts with the generated
 * header. Throws when a declaration cannot be emitted in isolation: a broken contract of the codegen.
 *
 * @param project - The in-memory ts-morph project.
 * @param path - The module's path in the output, POSIX, ending in `.ts`.
 * @param output - `module` (`.js` and `.d.ts`), `types` (`.d.ts` only) or `data` (`.js` only).
 * @param build - Adds the declarations to the source file.
 * @returns The files, each starting with the generated header.
 * @throws {Error} When a declaration cannot be emitted in isolation: a broken contract of the code generator.
 */
export function render(
  project: Project,
  path: string,
  output: Output,
  build: (file: SourceFile) => void,
): GeneratedFile[] {
  const base = path.replace(/\.ts$/, '');
  const file = project.createSourceFile(`/${base}.${output === 'data' ? 'js' : 'ts'}`, '', { overwrite: true });

  build(file);
  const text = file.getFullText();

  project.removeSourceFile(file);

  if (output === 'data') return [{ path: `${base}.js`, contents: `${HEADER}${text}` }];

  const files: GeneratedFile[] = [];

  if (output === 'module') {
    const js = ts.transpileModule(text, { compilerOptions: TRANSPILE, fileName: `${base}.ts` }).outputText;

    files.push({ path: `${base}.js`, contents: `${HEADER}${js}` });
  }

  const declaration = ts.transpileDeclaration(text, { compilerOptions: TRANSPILE, fileName: `${base}.ts` });
  const problem = declaration.diagnostics?.[0];

  if (problem !== undefined) {
    throw new Error(`Cannot declare ${base}.ts: ${ts.flattenDiagnosticMessageText(problem.messageText, ' ')}`);
  }

  files.push({
    path: `${base}.d.ts`,
    contents: `${HEADER}${formatted(project, `/${base}.d.ts`, declaration.outputText)}`,
  });

  return files;
}
