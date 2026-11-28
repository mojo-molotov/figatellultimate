/**
 * Rendering: an in-memory ts-morph project, a module built from declarations then transpiled file by file into
 * JavaScript, declarations, or both; every file starts with the generated header (the writer only ever removes such
 * files).
 *
 * Key design decision: a module's declarations are recorded as ts-morph structures, then
 * printed and parsed once (`ModuleBuilder`), never added one by one to a source file. Each addition re-parses the
 * whole file: a collection's index of 10,000 entries, built by about twenty additions, took seconds, its data parsed
 * twenty times. Rejected: writing the big data as text outside ts-morph, faster still but without the parse that
 * catches a malformed module, and with two ways of generating code.
 *
 * Invariant: every generated module typechecks, its order and its documentation kept (`emit.test.ts`).
 */
import { GENERATED_HEADER } from '@figatellultimate/core';
import {
  IndentationText,
  NewLineKind,
  Project,
  QuoteKind,
  StructureKind,
  ts,
  type ExportDeclarationStructure,
  type FunctionDeclarationStructure,
  type ImportDeclarationStructure,
  type InterfaceDeclarationStructure,
  type ModuleDeclarationStructure,
  type OptionalKind,
  type StatementStructures,
  type TypeAliasDeclarationStructure,
  type VariableStatementStructure,
} from 'ts-morph';

/** One generated file, path relative to the output folder (POSIX). */
export interface GeneratedFile {
  readonly path: string;
  readonly contents: string;
}

const HEADER = `${GENERATED_HEADER} Do not edit: run \`figatellultimate build\` instead.\n`;

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
 * What a module's builder adds, as ts-morph's structures: recorded in order, then printed and parsed once.
 */
export interface ModuleBuilder {
  /** Adds an import after the imports already added, as ts-morph does. */
  addImportDeclaration(structure: OptionalKind<ImportDeclarationStructure>): void;
  /** Inserts an import at a statement's index. */
  insertImportDeclaration(index: number, structure: OptionalKind<ImportDeclarationStructure>): void;
  addExportDeclaration(structure: OptionalKind<ExportDeclarationStructure>): void;
  addTypeAlias(structure: OptionalKind<TypeAliasDeclarationStructure>): void;
  addInterface(structure: OptionalKind<InterfaceDeclarationStructure>): void;
  addFunction(structure: OptionalKind<FunctionDeclarationStructure>): void;
  addVariableStatement(structure: OptionalKind<VariableStatementStructure>): void;
  addModule(structure: OptionalKind<ModuleDeclarationStructure>): void;
}

/** A builder recording its statements, for one print and one parse. */
function recorder(): { readonly builder: ModuleBuilder; readonly statements: StatementStructures[] } {
  const statements: StatementStructures[] = [];
  const imports = (): number => statements.filter((s) => s.kind === StructureKind.ImportDeclaration).length;

  return {
    statements,
    builder: {
      addImportDeclaration: (s) => statements.splice(imports(), 0, { ...s, kind: StructureKind.ImportDeclaration }),
      insertImportDeclaration: (index, s) =>
        statements.splice(index, 0, { ...s, kind: StructureKind.ImportDeclaration }),
      addExportDeclaration: (s) => statements.push({ ...s, kind: StructureKind.ExportDeclaration }),
      addTypeAlias: (s) => statements.push({ ...s, kind: StructureKind.TypeAlias }),
      addInterface: (s) => statements.push({ ...s, kind: StructureKind.Interface }),
      addFunction: (s) => statements.push({ ...s, kind: StructureKind.Function }),
      addVariableStatement: (s) => statements.push({ ...s, kind: StructureKind.VariableStatement }),
      addModule: (s) => statements.push({ ...s, kind: StructureKind.Module }),
    },
  };
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
 * @param build - Adds the declarations, recorded then printed once.
 * @returns The files, each starting with the generated header.
 * @throws {Error} When a declaration cannot be emitted in isolation: a broken contract of the code generator.
 */
export function render(
  project: Project,
  path: string,
  output: Output,
  build: (file: ModuleBuilder) => void,
): GeneratedFile[] {
  const base = path.replace(/\.ts$/, '');
  const { builder, statements } = recorder();

  build(builder);
  const file = project.createSourceFile(
    `/${base}.${output === 'data' ? 'js' : 'ts'}`,
    { statements },
    { overwrite: true },
  );
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
