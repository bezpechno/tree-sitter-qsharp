# tree-sitter-qsharp

[![CI][ci]](https://github.com/bezpechno/tree-sitter-qsharp/actions/workflows/ci.yml)
[![npm][npm]](https://www.npmjs.com/package/tree-sitter-qsharp)
[![crates][crates]](https://crates.io/crates/tree-sitter-qsharp)

[ci]: https://img.shields.io/github/actions/workflow/status/bezpechno/tree-sitter-qsharp/ci.yml?branch=main&logo=github&label=CI
[npm]: https://img.shields.io/npm/v/tree-sitter-qsharp?logo=npm
[crates]: https://img.shields.io/crates/v/tree-sitter-qsharp?logo=rust

A [tree-sitter](https://tree-sitter.github.io/) grammar for [Q#](https://learn.microsoft.com/en-us/azure/quantum/overview-what-is-qsharp-and-qdk), Microsoft's quantum programming language.

This is a new project, not affiliated with Microsoft or the tree-sitter organization. Feedback, bug reports, and contributions are welcome.

## What it does

Parses Q# source files into a concrete syntax tree that editors can use for syntax highlighting, code folding, symbol navigation, and indentation.

Built by reading the [Q# language reference](https://learn.microsoft.com/en-us/azure/quantum/user-guide/) and the [Q# compiler source](https://github.com/microsoft/qdk). Where the two disagree, the grammar follows the compiler. Every syntactically valid `.qs` file in the microsoft/qdk repository parses without errors.

### Supported constructs

- Namespaces, imports, exports, open directives
- Operations and functions with type parameters, class constraints (`'T : Eq + Exp[Int]`), functor clauses, specializations
- Structs, newtypes, all builtin types
- Local declarations: callables, structs, newtypes, `open` and `import` inside blocks
- Full expression grammar with operator precedence matching the compiler (`qsc_parse`). The [precedence table on Microsoft Learn](https://learn.microsoft.com/en-us/azure/quantum/user-guide/language/expressions/precedenceandassociativity) differs from the compiler in a few places, e.g. `-2 ^ 2` is `-(2 ^ 2)`, `a &&& 1 == 0` is `(a &&& 1) == 0`, and a lambda body extends as far as possible
- `return`, `fail` and `set` as expressions (`c ? x | fail "msg"`, no `;` needed at the end of a block)
- Trailing commas in every comma-separated list
- Unicode identifiers
- Quantum-specific syntax: `use`/`borrow`, `within`/`apply`, `repeat`/`until`/`fixup`, `Adjoint`/`Controlled`, `parallel`/`parallel within` (Q# 1.32)
- Loop control: `break`/`continue` (Q# 1.31)
- All literals: int, bigint, float, imaginary, string, interpolated string, bool, Result, Pauli
- External scanner for float/range disambiguation (`1.` vs `0..5`), imaginary literals (`1.i`) and interpolated string text

### Known limitations

- Explicit type arguments on calls (`Foo<Int>(x)`): the current Q# compiler parses `<` only as the comparison operator, so it reads `Foo<Int>(x)` as a comparison chain rather than a type application — this grammar matches that behavior. The syntax appears in older Q# docs but is not accepted by the current compiler (verified by running it).
- This is a v0.x project. There may be edge cases that are not yet covered.

## Editor query files

| Feature | File |
|---|---|
| Syntax highlighting | `queries/highlights.scm` |
| Code folding | `queries/folds.scm` |
| Symbol outline | `queries/tags.scm` |
| Auto-indentation | `queries/indents.scm` |
| Scope tracking | `queries/locals.scm` |
| Text objects | `queries/textobjects.scm` |

Highlight and locals capture names follow the [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter/blob/main/CONTRIBUTING.md) conventions; indents and text objects use [Helix](https://docs.helix-editor.com/guides/indent.html)'s capture names.

## Contributing

If you find Q# code that doesn't parse correctly, please open an issue with the `.qs` file or a minimal reproducing snippet. Pull requests are welcome.

## References

- [Q# overview](https://learn.microsoft.com/en-us/azure/quantum/overview-what-is-qsharp-and-qdk)
- [microsoft/qdk](https://github.com/microsoft/qdk) (formerly microsoft/qsharp) — Q# compiler and standard library (MIT)
- [tree-sitter](https://tree-sitter.github.io/tree-sitter/) — parser generator

## License

MIT
