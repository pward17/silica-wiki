// A small line diff for showing a page's last change, with the changed words
// marked inside a line that was edited rather than replaced. Pages are short
// (the lint keeps them under 1000 lines), so a plain longest-common-subsequence
// table is fast enough and keeps the build free of another dependency.

export type LineKind = "same" | "add" | "del"

export interface Piece {
  text: string
  changed: boolean
}

export interface DiffLine {
  kind: LineKind
  text: string
  // Set on an edited line: its text split into unchanged and changed runs.
  pieces?: Piece[]
}

// One run of changed lines with a little context, or a gap between two runs.
export type Hunk = { lines: DiffLine[] } | { skipped: number }

// Above this many table cells the diff gives up on finding common lines in
// the changed middle and shows it as removed then added.
const MAX_CELLS = 4_000_000
const CONTEXT = 2

// The longest common subsequence of a and b, as [kind, index] steps.
function lcs<T>(a: T[], b: T[]): ["same" | "add" | "del", number][] {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const steps: ["same" | "add" | "del", number][] = []
  for (let i = 0; i < start; i++) steps.push(["same", i])

  const n = endA - start
  const m = endB - start
  if (n * m > MAX_CELLS) {
    for (let i = start; i < endA; i++) steps.push(["del", i])
    for (let j = start; j < endB; j++) steps.push(["add", j])
  } else {
    // table[i][j]: the common length of a[start+i..endA) and b[start+j..endB).
    const width = m + 1
    const table = new Uint32Array((n + 1) * width)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] =
          a[start + i] === b[start + j]
            ? table[(i + 1) * width + j + 1] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        steps.push(["same", start + i])
        i++
        j++
      } else if (j < m && (i === n || table[i * width + j + 1] >= table[(i + 1) * width + j])) {
        steps.push(["add", start + j])
        j++
      } else {
        steps.push(["del", start + i])
        i++
      }
    }
  }

  for (let i = endA; i < a.length; i++) steps.push(["same", i])
  return steps
}

const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu

// The changed words of an edited line, or undefined when the two lines share
// too little for word marks to help.
function wordPieces(before: string, after: string): [Piece[], Piece[]] | undefined {
  const a = before.match(TOKEN) ?? []
  const b = after.match(TOKEN) ?? []
  const steps = lcs(a, b)
  const words = (tokens: string[]) => tokens.filter((t) => t.trim() !== "").length
  const kept = words(steps.filter(([kind]) => kind === "same").map(([, i]) => a[i]))
  if (kept < 0.4 * Math.max(words(a), words(b))) return undefined

  const del: Piece[] = []
  const add: Piece[] = []
  const push = (pieces: Piece[], text: string, changed: boolean) => {
    const last = pieces[pieces.length - 1]
    if (last && last.changed === changed) last.text += text
    else pieces.push({ text, changed })
  }
  for (const [kind, index] of steps) {
    if (kind === "same") {
      push(del, a[index], false)
      push(add, a[index], false)
    } else if (kind === "del") push(del, a[index], true)
    else push(add, b[index], true)
  }
  return [del, add]
}

// The lines of `before` and `after` as a diff, removed lines before added.
export function diffLines(before: string[], after: string[]): DiffLine[] {
  const lines: DiffLine[] = []
  let dels: string[] = []
  let adds: string[] = []
  const flush = () => {
    // Pair the removed and added lines of one change in order; a pair close
    // enough to be an edit gets its changed words marked.
    const paired = Math.min(dels.length, adds.length)
    const marks = Array.from({ length: paired }, (_, k) => wordPieces(dels[k], adds[k]))
    dels.forEach((text, k) => lines.push({ kind: "del", text, pieces: marks[k]?.[0] }))
    adds.forEach((text, k) => lines.push({ kind: "add", text, pieces: marks[k]?.[1] }))
    dels = []
    adds = []
  }
  for (const [kind, index] of lcs(before, after)) {
    if (kind === "del") dels.push(before[index])
    else if (kind === "add") adds.push(after[index])
    else {
      flush()
      lines.push({ kind: "same", text: before[index] })
    }
  }
  flush()
  return lines
}

// The changed lines with CONTEXT lines either side; the rest become gaps.
export function hunks(lines: DiffLine[]): Hunk[] {
  const keep = lines.map(() => false)
  lines.forEach((line, i) => {
    if (line.kind === "same") return
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(lines.length - 1, i + CONTEXT); k++) {
      keep[k] = true
    }
  })

  const result: Hunk[] = []
  let run: DiffLine[] = []
  let skipped = 0
  lines.forEach((line, i) => {
    if (keep[i]) {
      if (skipped) result.push({ skipped })
      skipped = 0
      run.push(line)
    } else {
      if (run.length) result.push({ lines: run })
      run = []
      skipped++
    }
  })
  if (run.length) result.push({ lines: run })
  if (skipped) result.push({ skipped })
  return result
}
