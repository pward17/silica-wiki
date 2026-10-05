import { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import { Root } from "hast"

// Block elements worth anchoring. Inline elements would report the same line
// as their block and only add noise.
const BLOCKS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "table",
  "tr",
  "figure",
])

// Stamps each block with the markdown line it came from, so a reader's
// selection can be reported back as a line range in the source file. The
// positions survive the markdown-to-html conversion, and nothing else in the
// build knows where a rendered paragraph lived.
export const SourceLines: QuartzTransformerPlugin = () => ({
  name: "SourceLines",
  htmlPlugins() {
    return [
      () => {
        return (tree: Root) => {
          visit(tree, "element", (node) => {
            if (!BLOCKS.has(node.tagName)) return
            const start = node.position?.start?.line
            if (!start) return
            node.properties = {
              ...node.properties,
              "data-line": start,
              "data-line-end": node.position?.end?.line ?? start,
            }
          })
        }
      },
    ]
  },
})
