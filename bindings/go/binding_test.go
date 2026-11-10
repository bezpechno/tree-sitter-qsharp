package tree_sitter_qsharp_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_qsharp "github.com/bezpechno/tree-sitter-qsharp/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_qsharp.Language())
	if language == nil {
		t.Errorf("Error loading Qsharp grammar")
	}

	// NewLanguage doesn't check the ABI version; SetLanguage does.
	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(language); err != nil {
		t.Errorf("Error setting Qsharp grammar: %v", err)
	}
}
