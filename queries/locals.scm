; locals.scm — Scope and variable resolution for Q#
; Used by editors for improved highlighting, go-to-definition, and rename.

; Scopes
(block) @local.scope
(callable_decl) @local.scope
(namespace) @local.scope
(for_expression) @local.scope
(while_expression) @local.scope
(repeat_expression) @local.scope
(if_expression) @local.scope
(conjugation_expression) @local.scope

; Definitions
; Bindings in let / mutable / use / borrow / for, including nested and typed
; tuple patterns
(pattern
  (identifier) @local.definition)

(typed_param
  name: (identifier) @local.definition)

; Callables, including ones declared inside a block
(callable_decl
  name: (identifier) @local.definition)

; References
(identifier) @local.reference
