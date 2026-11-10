/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Operator precedence, matching the Q# compiler (qsc_parse/src/expr.rs:
// prefix_op and mixfix_op). Microsoft Learn's precedence table differs from the
// compiler in several places (comparisons vs bitwise operators, `-x ^ y`,
// lambdas, `?|` vs `w/`); where they disagree we follow the compiler, which is
// what decides what a program means.
const PREC = {
  ASSIGN: 0,     // = op= w/=
  LAMBDA: 1,     // -> =>
  RANGE: 1,      // .. ...
  UPDATE: 1,     // w/ <-  (left)
  TERNARY: 1,    // ? |    (right)
  OR: 2,         // or
  AND: 3,        // and
  COMPARISON: 4, // == != < <= > >=
  BIT_OR: 5,     // |||
  BIT_XOR: 6,    // ^^^
  BIT_AND: 7,    // &&&
  SHIFT: 8,      // <<< >>>
  ADD: 9,        // + -
  MUL: 10,       // * / %
  PREFIX: 11,    // not ~~~ + -
  EXP: 12,       // ^ (right)
  CALL: 13,      // ( )
  FUNCTOR: 14,   // Adjoint Controlled
  POSTFIX: 15,   // !
  ACCESS: 15,    // . :: []
};

export default grammar({
  name: "qsharp",

  extras: ($) => [/\s/, $.comment, $.doc_comment],

  externals: ($) => [
    $.float_literal,
    $.imaginary_literal,
    $.interpolation_content,
    $._error_sentinel, // unused token to detect error recovery mode
  ],

  supertypes: ($) => [
    $.literal,
    $.type,
  ],

  word: ($) => $.identifier,

  conflicts: ($) => [
    [$.expression_statement, $._expression],
    [$.type_def, $.tuple_type],
  ],

  rules: {
    // =====================================================================
    // Top-level structure
    // =====================================================================

    source_file: ($) =>
      seq(repeat(choice($.namespace, $._statement)), optional($._trailing_expression)),

    namespace: ($) =>
      seq("namespace", field("name", $.path_or_identifier), "{", repeat($._namespace_item), "}"),

    _namespace_item: ($) => $._top_level_item,

    _top_level_item: ($) =>
      choice(
        $.import_decl,
        $.export_decl,
        $.open_decl,
        $.callable_decl,
        $.newtype_decl,
        $.struct_decl
      ),

    // =====================================================================
    // Import / Export / Open
    // =====================================================================

    import_decl: ($) => seq(repeat($.attribute), "import", commaSep1($.import_item), ";"),

    import_item: ($) =>
      seq($.import_path, optional(seq("as", $.identifier))),

    import_path: ($) =>
      choice(
        seq($.identifier, repeat(seq(".", $.identifier)), ".", "*"),
        seq($.identifier, repeat(seq(".", $.identifier)))
      ),

    export_decl: ($) => seq(repeat($.attribute), "export", commaSep1($.export_item), ";"),

    export_item: ($) => seq($.path_or_identifier, optional(seq("as", $.identifier))),

    open_decl: ($) =>
      seq(repeat($.attribute), "open", $.path_or_identifier, optional(seq("as", $.identifier)), ";"),

    // =====================================================================
    // Callable declarations (operation / function)
    // =====================================================================

    callable_decl: ($) =>
      seq(
        repeat($.attribute),
        optional("internal"),
        choice("operation", "function"),
        field("name", $.identifier),
        optional($.type_params),
        field("params", $.param_list),
        ":",
        field("return_type", $.type),
        optional($.functor_clause),
        field("body", $.callable_body)
      ),

    // The compiler takes any expression after the name (qsc_parse item.rs
    // parse_attr), so the argument may be a tuple such as
    // `@CircuitRenderingOptions(hideBox=true, inputSizes=[3, 4])`.
    attribute: ($) =>
      seq(
        "@",
        $.path_or_identifier,
        optional(seq("(", optional(commaSep1($._expression)), ")"))
      ),

    type_params: ($) => seq("<", commaSep1($.type_param), ">"),

    // `'T`, `'T : Eq + Show`, `'T : Exp[Int]`
    type_param: ($) =>
      seq($.apos_ident, optional(seq(":", sep1($.class_constraint, "+")))),

    class_constraint: ($) =>
      seq(field("name", $.identifier), optional(seq("[", commaSep1($.type), "]"))),

    param_list: ($) => seq("(", optional(commaSep1($._param)), ")"),

    _param: ($) => choice($.typed_param, $.tuple_param),

    typed_param: ($) =>
      seq(field("name", $.identifier), ":", field("type", $.type)),

    tuple_param: ($) => seq("(", commaSep1($._param), ")"),

    functor_clause: ($) => seq("is", $.functor_expr),

    functor_expr: ($) =>
      choice(
        "Adj",
        "Ctl",
        prec.left(1, seq($.functor_expr, "+", $.functor_expr)),
        prec.left(2, seq($.functor_expr, "*", $.functor_expr)),
        seq("(", $.functor_expr, ")")
      ),

    callable_body: ($) => choice($.block, $.specialization_list),

    specialization_list: ($) => seq("{", repeat1($.specialization), "}"),

    specialization: ($) =>
      seq(
        $.spec_name,
        choice(
          seq($.spec_generator, ";"),
          seq(optional($.spec_param), $.block)
        )
      ),

    spec_name: ($) =>
      choice("body", "adjoint", seq("controlled", optional("adjoint"))),

    spec_generator: ($) =>
      choice("auto", "distribute", "intrinsic", "invert", "self"),

    // `body ...`, `adjoint ...`, `body (cs, ...)`, `controlled (cs, ...)`
    spec_param: ($) =>
      choice("...", seq("(", commaSep1(choice($.identifier, "...")), ")")),

    // =====================================================================
    // Type declarations
    // =====================================================================

    newtype_decl: ($) =>
      seq(
        repeat($.attribute),
        optional("internal"),
        "newtype",
        field("name", $.identifier),
        "=",
        $.type_def,
        ";"
      ),

    type_def: ($) =>
      choice(
        seq($.identifier, ":", $.type),
        $.type,
        seq("(", commaSep1($.type_def), ")")
      ),

    struct_decl: ($) =>
      seq(
        repeat($.attribute),
        optional("internal"),
        "struct",
        field("name", $.identifier),
        "{",
        optional(commaSep1($.field_def)),
        "}"
      ),

    field_def: ($) =>
      seq(field("name", $.identifier), ":", field("type", $.type)),

    // =====================================================================
    // Statements
    // =====================================================================

    _statement: ($) =>
      choice(
        $.let_statement,
        $.mutable_statement,
        $.use_statement,
        $.borrow_statement,
        // Any item (callable, struct, newtype, open, import, export) may also be
        // declared locally inside a block.
        $._top_level_item,
        $.expression_statement,
        $.empty_statement
      ),

    let_statement: ($) =>
      seq("let", $.pattern, optional(seq(":", $.type)), "=", $._expression, ";"),

    mutable_statement: ($) =>
      seq("mutable", $.pattern, optional(seq(":", $.type)), "=", $._expression, ";"),

    use_statement: ($) =>
      seq("use", $.pattern, optional(seq(":", $.type)), "=", $.qubit_init, choice(";", $.block)),

    borrow_statement: ($) =>
      seq("borrow", $.pattern, optional(seq(":", $.type)), "=", $.qubit_init, choice(";", $.block)),

    expression_statement: ($) =>
      choice(
        seq($._expression_no_block, ";"),
        $._expression_with_block
      ),

    // Only the last expression of a block (or file) may omit its `;`, as in the
    // compiler (qsc_parse stmt.rs check_semis). Allowing it anywhere made
    // `a b c` three statements and hid missing semicolons.
    _trailing_expression: ($) =>
      alias($._expression_no_block, $.expression_statement),

    empty_statement: (_) => ";",

    // =====================================================================
    // Qubit initializers
    // =====================================================================

    qubit_init: ($) =>
      choice(
        seq("Qubit", "(", ")"),
        seq("Qubit", "[", $._expression, "]"),
        seq("(", commaSep1($.qubit_init), ")")
      ),

    // =====================================================================
    // Patterns
    // =====================================================================

    pattern: ($) =>
      choice(
        $.identifier,
        $.discard,
        seq("(", optional(commaSep1(choice($.pattern, alias($._typed_pattern, $.pattern)))), ")")
      ),

    // `(a : Int, _ : Double)`. At the top of `let`/`use`/... the annotation is
    // parsed by the statement itself.
    _typed_pattern: ($) => seq(choice($.identifier, $.discard), ":", $.type),

    discard: (_) => "_",

    // =====================================================================
    // Types
    // =====================================================================

    type: ($) =>
      choice(
        $.builtin_type,
        $.apos_ident,
        $.path,
        $.identifier,
        $.array_type,
        $.tuple_type,
        $.callable_type,
        $.discard // type hole — compiler-inferred type
      ),

    builtin_type: (_) =>
      choice("Unit", "Int", "BigInt", "Double", "Bool", "String", "Qubit", "Result", "Pauli", "Range"),

    array_type: ($) => prec.left(seq($.type, "[", "]")),

    tuple_type: ($) => seq("(", optional(commaSep1($.type)), ")"),

    callable_type: ($) =>
      prec.right(seq($.type, choice("->", "=>"), $.type, optional(seq("is", $.functor_expr)))),

    // =====================================================================
    // Expressions
    // =====================================================================

    _expression: ($) =>
      choice($._expression_no_block, $._expression_with_block),

    _expression_no_block: ($) =>
      choice(
        // Dotted names in expressions (`a.b.c`, `Std.Math.PI`) are field_expression
        // chains: syntax alone can't tell a namespace path from field access, and
        // the compiler resolves that later.
        $.identifier,
        $.literal,
        $.parenthesized_expression,
        $.unit_expression,
        $.tuple_expression,
        $.array_expression,
        $.array_repeat_expression,
        $.string_interpolation,
        $.unary_expression,
        $.binary_expression,
        $.assignment_expression,
        $.compound_assignment_expression,
        $.update_assignment_expression,
        $.update_expression,
        $.ternary_expression,
        $.call_expression,
        $.index_expression,
        $.field_expression,
        $.unwrap_expression,
        $.lambda_expression,
        $.range_expression,
        $.step_range_expression,
        $.open_range_start,
        $.open_range_end,
        $.full_range,
        $.new_expression,
        $.set_expression,
        $.return_expression,
        $.fail_expression,
        $.parallel_expression,
        $.break_expression,
        $.continue_expression,
        $.discard
      ),

    _expression_with_block: ($) =>
      choice(
        $.block,
        $.if_expression,
        $.for_expression,
        $.while_expression,
        $.repeat_expression,
        $.conjugation_expression,
        alias($._parallel_block_expression, $.parallel_expression)
      ),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    unit_expression: (_) => seq("(", ")"),

    tuple_expression: ($) =>
      seq("(", $._expression, ",", optional(commaSep1($._expression)), ")"),

    array_expression: ($) =>
      seq("[", optional(commaSep1($._expression)), "]"),

    array_repeat_expression: ($) =>
      seq("[", $._expression, ",", "size", "=", $._expression, "]"),

    string_interpolation: ($) =>
      seq('$"', repeat(choice($.interpolation_content, $.interpolation_expression)), '"'),

    // interpolation_content: handled by the external scanner so that
    // whitespace and `//` inside the string stay string text instead of being
    // skipped as extras. Runs up to the next unescaped `"` or `{`; a lone `}`
    // is plain text (lex/raw.rs).

    interpolation_expression: ($) => seq("{", $._expression, "}"),

    // --- Operators ---

    unary_expression: ($) =>
      choice(
        prec(PREC.PREFIX, seq(choice("-", "+", "not", "~~~"), $._expression)),
        prec(PREC.FUNCTOR, seq(choice("Adjoint", "Controlled"), $._expression))
      ),

    binary_expression: ($) =>
      choice(
        prec.left(PREC.OR, seq($._expression, "or", $._expression)),
        prec.left(PREC.AND, seq($._expression, "and", $._expression)),
        prec.left(PREC.COMPARISON, seq($._expression, choice("==", "!=", "<", "<=", ">", ">="), $._expression)),
        prec.left(PREC.BIT_OR, seq($._expression, "|||", $._expression)),
        prec.left(PREC.BIT_XOR, seq($._expression, "^^^", $._expression)),
        prec.left(PREC.BIT_AND, seq($._expression, "&&&", $._expression)),
        prec.left(PREC.SHIFT, seq($._expression, choice("<<<", ">>>"), $._expression)),
        prec.left(PREC.ADD, seq($._expression, choice("+", "-"), $._expression)),
        prec.left(PREC.MUL, seq($._expression, choice("*", "/", "%"), $._expression)),
        prec.right(PREC.EXP, seq($._expression, "^", $._expression))
      ),

    assignment_expression: ($) =>
      prec.right(PREC.ASSIGN, seq($._expression, "=", $._expression)),

    compound_assignment_expression: ($) =>
      prec.right(
        PREC.ASSIGN,
        seq(
          $._expression,
          choice("+=", "-=", "*=", "/=", "%=", "^=", "&&&=", "|||=", "^^^=", "<<<=", ">>>=", "and=", "or="),
          $._expression
        )
      ),

    // `arr w/= i <- value`
    update_assignment_expression: ($) =>
      prec.right(PREC.ASSIGN, seq($._expression, "w/=", $._expression, "<-", $._expression)),

    update_expression: ($) =>
      prec.left(PREC.UPDATE, seq($._expression, "w/", $._expression, "<-", $._expression)),

    ternary_expression: ($) =>
      prec.right(PREC.TERNARY, seq($._expression, "?", $._expression, "|", $._expression)),

    // Q# *documents* explicit type arguments at call sites, e.g. `CControlled<'T3>`
    // or `Mapped<String[], _>(...)` (see Microsoft's "Type parameterizations" and
    // "Type inference" pages). But the current reference compiler doesn't parse
    // them: qsc_parse/src/expr.rs treats `<` only as BinOp::Lt and call_op accepts
    // only `lhs ( args )` (the classic C#/F# compiler did support the syntax). We
    // match the current compiler, so `Foo<Int>(x)` parses as the comparison chain
    // `Foo < Int > (x)`. Supporting it would mean resolving a `<` ambiguity that the
    // reference parser itself leaves unresolved here.
    call_expression: ($) =>
      prec(PREC.CALL, seq($._expression, "(", optional(commaSep1($._expression)), ")")),

    index_expression: ($) =>
      prec(PREC.ACCESS, seq($._expression, "[", $._expression, "]")),

    field_expression: ($) =>
      prec(PREC.ACCESS, seq($._expression, choice(".", "::"), field("field", $.identifier))),

    unwrap_expression: ($) =>
      prec(PREC.POSTFIX, seq($._expression, "!")),

    lambda_expression: ($) =>
      prec.right(PREC.LAMBDA, seq($._expression, choice("->", "=>"), $._expression)),

    // Ranges follow the compiler's range_op / expr_range_prefix: the operands
    // after `..` are parsed one level above ranges, and a second `..` or a
    // trailing `...` always continues the same range as its step/end.
    //   a..b       range_expression
    //   a..s..b    step_range_expression (start, step: s, end: b)
    //   a..s...    step_range_expression (start, step: s)
    //   ...s..b    step_range_expression (step: s, end: b)
    //   ...s...    step_range_expression (step: s)
    //   a...       open_range_start      ...b   open_range_end      ...  full_range
    range_expression: ($) =>
      prec.left(PREC.RANGE, seq($._range_start, $._expression)),

    // `start ..`, shared by both range forms. Keeping the first `..` in its own
    // rule stops the step form's higher precedence from leaking onto it (which
    // would make `a w/ i <- b .. c` take the range into the update).
    _range_start: ($) => prec.left(PREC.RANGE, seq($._expression, "..")),

    step_range_expression: ($) =>
      prec.left(
        PREC.RANGE,
        seq(
          choice($._range_step, $._open_range_step),
          choice(seq("..", field("end", $._expression)), "...")
        )
      ),

    // These only reduce before `..`/`...`, where they must win over
    // range_expression / open_range_end; their higher precedence decides that.
    _range_step: ($) =>
      prec.right(PREC.RANGE + 1, seq($._range_start, field("step", $._expression))),

    _open_range_step: ($) =>
      prec.right(PREC.RANGE + 2, seq("...", field("step", $._expression))),

    // `start...`: like `..`, the postfix `...` applies to everything before it
    // (`i + 1...` is `(i + 1)...`).
    open_range_start: ($) =>
      prec.left(PREC.RANGE, seq($._expression, "...")),

    // `...end`: the operand is parsed one level above ranges (`...n - 1` is
    // `...(n - 1)`).
    open_range_end: ($) =>
      prec.right(PREC.RANGE + 1, seq("...", $._expression)),

    full_range: (_) => "...",

    new_expression: ($) =>
      choice(
        seq("new", $.path_or_identifier, "{", optional($.struct_fields), "}"),
        seq("new", $.type, "[", $._expression, "]")
      ),

    struct_fields: ($) =>
      choice(
        seq("...", $._expression, optional(seq(",", sep1($.field_assign, ","), optional(",")))),
        seq(sep1($.field_assign, ","), optional(","))
      ),

    field_assign: ($) =>
      seq(field("name", $.identifier), "=", field("value", $._expression)),

    // --- Block expressions ---

    block: ($) => seq("{", repeat($._statement), optional($._trailing_expression), "}"),

    if_expression: ($) =>
      seq(
        "if",
        field("condition", $._expression),
        field("body", $.block),
        repeat($.elif_clause),
        optional($.else_clause)
      ),

    elif_clause: ($) =>
      seq("elif", field("condition", $._expression), field("body", $.block)),

    else_clause: ($) => seq("else", $.block),

    for_expression: ($) =>
      seq("for", $.pattern, "in", $._expression, $.block),

    while_expression: ($) =>
      seq("while", $._expression, $.block),

    repeat_expression: ($) =>
      choice(
        seq("repeat", $.block, "until", $._expression, "fixup", $.block),
        seq("repeat", $.block, "until", $._expression, ";")
      ),

    conjugation_expression: ($) =>
      seq("within", $.block, "apply", $.block),

    // `return`, `fail` and `set` are expressions whose operand is a full
    // expression, so they nest (`c ? x | fail "msg"`) and, like any expression,
    // may end a block without `;`.
    return_expression: ($) => prec.right(PREC.ASSIGN, seq("return", $._expression)),

    fail_expression: ($) => prec.right(PREC.ASSIGN, seq("fail", $._expression)),

    // `set x = expr`, `set x += expr`, `set (a, b) = (1, 2)`
    set_expression: ($) => prec.right(PREC.ASSIGN, seq("set", $._expression)),

    // `parallel <expr>` and `parallel within <limit> <expr>` (Q# 1.32). The body
    // is a full expression, as in the compiler. Like there, a `parallel` whose
    // body is block-like (`parallel for ... { }`) ends a statement without `;`.
    parallel_expression: ($) =>
      prec.right(PREC.ASSIGN, seq("parallel", optional($._parallel_limit), field("body", $._expression))),

    _parallel_block_expression: ($) =>
      prec(PREC.ASSIGN + 1, seq("parallel", optional($._parallel_limit), field("body", $._expression_with_block))),

    _parallel_limit: ($) => seq("within", field("limit", $._expression)),

    break_expression: (_) => "break",

    continue_expression: (_) => "continue",

    // =====================================================================
    // Paths and identifiers
    // =====================================================================

    path_or_identifier: ($) => choice($.path, $.identifier),

    path: ($) => prec.left(seq($.identifier, repeat1(seq(".", $.identifier)))),

    // =====================================================================
    // Literals
    // =====================================================================

    literal: ($) =>
      choice(
        $.integer_literal,
        $.bigint_literal,
        $.float_literal,
        $.imaginary_literal,
        $.string_literal,
        $.bool_literal,
        $.result_literal,
        $.pauli_literal
      ),

    integer_literal: (_) =>
      token(choice(/0[bB][01_]+/, /0[oO][0-7_]+/, /0[xX][0-9a-fA-F_]+/, /[0-9][0-9_]*/)),

    bigint_literal: (_) =>
      token(choice(/0[bB][01_]+L/, /0[oO][0-7_]+L/, /0[xX][0-9a-fA-F_]+L/, /[0-9][0-9_]*L/)),

    // float_literal and imaginary_literal: handled by the external scanner
    // (src/scanner.c) to disambiguate `1.` (float) and `1.i` (imaginary) from
    // `0..` (integer + range). An imaginary literal is a float followed by `i`,
    // so `1.i` and `1e3i` are valid but `1i` is not.

    string_literal: (_) => token(seq('"', repeat(choice(/[^"\\]/, /\\./)), '"')),

    bool_literal: (_) => choice("true", "false"),

    result_literal: (_) => choice("Zero", "One"),

    pauli_literal: (_) => choice("PauliI", "PauliX", "PauliY", "PauliZ"),

    // =====================================================================
    // Identifiers and comments
    // =====================================================================

    // Note: `_` alone is NOT an identifier in Q# — it's a discard/hole.
    // The word rule handles this: tree-sitter matches `_` as keyword, not identifier.
    // Unicode, like the compiler's lexer (char::is_alphabetic for the first
    // character, is_alphanumeric after it).
    identifier: (_) => /[_\p{Alphabetic}][_\p{Alphabetic}\p{N}]*/,

    apos_ident: (_) => /'[_\p{Alphabetic}][_\p{Alphabetic}\p{N}]*/,

    // `//` is a normal comment; `///` (exactly three slashes) is a doc comment.
    // Four or more leading slashes (`////`) is a NORMAL comment, matching the Q#
    // compiler's lexer (qsc_parse/src/lex/raw.rs: Doc only when the 3rd char is
    // `/` and the 4th is not). The comment body's first alternative forbids a
    // leading slash so `///x` is left to doc_comment; the second alternative
    // (`//` again) lets `////…` be consumed here as a normal comment.
    comment: (_) => token(seq("//", optional(choice(/[^/\n][^\n]*/, /\/\/[^\n]*/)))),

    doc_comment: (_) => token(seq("///", optional(/[^/\n][^\n]*/))),
  },
});

function sep1(rule, delimiter) {
  return seq(rule, repeat(seq(delimiter, rule)));
}

// Comma-separated list that allows a trailing comma, like every comma list in
// the Q# compiler (qsc_parse/src/prim.rs `seq`).
function commaSep1(rule) {
  return seq(sep1(rule, ","), optional(","));
}
