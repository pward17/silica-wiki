import test from "node:test"
import assert from "node:assert"
import { parseBlocks, parseInline, plainText } from "./markdown"

test("a fenced block keeps its text and its language", () => {
  const blocks = parseBlocks("before\n\n```sql\nSELECT 1;\n\nSELECT 2;\n```\n\nafter")
  assert.deepEqual(blocks, [
    { kind: "paragraph", lines: ["before"] },
    { kind: "code", value: "SELECT 1;\n\nSELECT 2;", lang: "sql" },
    { kind: "paragraph", lines: ["after"] },
  ])
})

test("an unclosed fence still reads as code rather than losing the text", () => {
  assert.deepEqual(parseBlocks("```\nhalf a block"), [
    { kind: "code", value: "half a block", lang: undefined },
  ])
})

test("bullets and numbers become lists, and a paragraph ends where a list starts", () => {
  assert.deepEqual(parseBlocks("why:\n- one\n- two\n\n1. first\n2) second"), [
    { kind: "paragraph", lines: ["why:"] },
    { kind: "list", ordered: false, items: ["one", "two"] },
    { kind: "list", ordered: true, items: ["first", "second"] },
  ])
})

test("lines inside one paragraph are kept apart", () => {
  assert.deepEqual(parseBlocks("one\ntwo"), [{ kind: "paragraph", lines: ["one", "two"] }])
})

test("inline code, bold and italic", () => {
  assert.deepEqual(parseInline("call `set_config` **now**, it is _urgent_"), [
    { kind: "text", value: "call " },
    { kind: "code", value: "set_config" },
    { kind: "text", value: " " },
    { kind: "strong", value: "now" },
    { kind: "text", value: ", it is " },
    { kind: "em", value: "urgent" },
  ])
})

test("bold wins over italic on the same stars", () => {
  assert.deepEqual(parseInline("**both**"), [{ kind: "strong", value: "both" }])
})

test("an underscore inside a name is not italic", () => {
  assert.deepEqual(parseInline("row_level_security is fine"), [
    { kind: "text", value: "row_level_security is fine" },
  ])
})

test("markup inside code is left alone", () => {
  assert.deepEqual(parseInline("`a **b** c`"), [{ kind: "code", value: "a **b** c" }])
})

test("a written link and a bare one both become links", () => {
  assert.deepEqual(
    parseInline("see [the docs](https://example.com/a) and https://example.com/b."),
    [
      { kind: "text", value: "see " },
      { kind: "link", value: "the docs", href: "https://example.com/a" },
      { kind: "text", value: " and " },
      { kind: "link", value: "https://example.com/b", href: "https://example.com/b" },
      { kind: "text", value: "." },
    ],
  )
})

test("a link to anything but http or https stays text", () => {
  assert.deepEqual(parseInline("[x](javascript:alert(1)) [y](data:text/html,hi)"), [
    { kind: "text", value: "[x](javascript:alert(1)) [y](data:text/html,hi)" },
  ])
})

test("angle brackets are carried as text, never as markup", () => {
  assert.deepEqual(parseInline("<img src=x onerror=alert(1)>"), [
    { kind: "text", value: "<img src=x onerror=alert(1)>" },
  ])
})

test("a preview carries the words without the markup", () => {
  const src =
    "The revoke **does not** help.\n\n```sql\nSELECT 1;\n```\n\n- see `pg_proc`\n- and [the docs](https://example.com)"
  assert.equal(plainText(src), "The revoke does not help. SELECT 1; see pg_proc and the docs")
})
