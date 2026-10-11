// The status chip as a menu, for the people on the wiki's approver list.
// Everyone else keeps the plain chip: /api/status says whether this reader may
// change the page, and the chip only turns into a button when it says yes.
// Picking a move commits the frontmatter change to the default branch through
// functions/api/status.js; the page shows it once the site has rebuilt.

const MENU_ID = "wiki-status-menu"

interface Move {
  to: string
  note: string
}

interface StatusState {
  canEdit: boolean
  name?: string
  status?: string
  approvals?: { who: string; when?: string }[]
  moves?: Move[]
  canApprove?: boolean
  error?: string
}

function badge(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".status-badge[data-page-path]")
}

function closeMenu() {
  document.getElementById(MENU_ID)?.remove()
  document.querySelector(".status-chip.status-editable")?.setAttribute("aria-expanded", "false")
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// What the chips under the title say after a change, so the person sees it
// land before the rebuild catches up.
function repaint(chip: HTMLElement, state: StatusState) {
  if (!state.status) return
  chip.className = chip.className.replace(/status-(slop|draft|active|superseded|dropped)/, "")
  chip.classList.add(`status-${state.status}`)
  chip.textContent = state.status
  const line = badge()?.querySelector<HTMLElement>(".verification")
  const approvals = state.approvals ?? []
  if (line) {
    line.className = `verification ${approvals.length > 0 ? "verified" : "not-verified"}`
    line.textContent =
      approvals.length > 0
        ? `Verified by ${approvals.map((a) => (a.when ? `${a.who} (${a.when})` : a.who)).join(", ")}`
        : "Not verified"
  }
}

async function pageNames(): Promise<string[]> {
  try {
    const data = await fetchData
    const names = Object.keys(data)
      .map((slug) => slug.split("/").pop() || "")
      .filter((name) => name && name !== "index")
    return [...new Set(names)].sort()
  } catch {
    return []
  }
}

async function commit(chip: HTMLElement, body: Record<string, unknown>, menu: HTMLElement) {
  const source = badge()!
  const message = menu.querySelector<HTMLElement>(".wiki-status-message")!
  menu.querySelectorAll("button").forEach((b) => (b.disabled = true))
  message.textContent = "Committing..."
  try {
    const res = await fetch("/api/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: source.dataset.pagePath,
        commit: source.dataset.pageCommit || "",
        ...body,
      }),
    })
    const state = (await res.json()) as StatusState
    if (!res.ok) throw new Error(state.error || `The server answered ${res.status}.`)
    repaint(chip, state)
    chip.dataset.state = JSON.stringify(state)
    renderMenu(chip, state, "Committed. The site shows it after its next build.")
  } catch (err) {
    message.textContent = (err as Error).message
    menu.querySelectorAll("button").forEach((b) => (b.disabled = false))
  }
}

// Asking once before committing: a commit to the default branch is not a
// click anyone should make by accident.
function confirmStep(chip: HTMLElement, menu: HTMLElement, state: StatusState, move: Move | null) {
  const step = menu.querySelector<HTMLElement>(".wiki-status-confirm")!
  step.replaceChildren()
  const what = move
    ? `${state.status} → ${move.to}${move.to === "active" ? `, approved by ${state.name}` : ""}`
    : `Add ${state.name} to the approvals`
  step.appendChild(el("p", "wiki-status-what", what))

  let input: HTMLInputElement | null = null
  if (move?.to === "superseded") {
    input = el("input", "wiki-status-input")
    input.placeholder = "Page that replaces this one"
    input.setAttribute("list", "wiki-status-pages")
    const list = el("datalist", "")
    list.id = "wiki-status-pages"
    pageNames().then((names) =>
      names.forEach((name) => {
        const option = document.createElement("option")
        option.value = name
        list.appendChild(option)
      }),
    )
    step.append(input, list)
  }

  const row = el("div", "wiki-status-actions")
  const go = el("button", "wiki-status-go", "Commit")
  go.type = "button"
  const cancel = el("button", "wiki-status-cancel", "Cancel")
  cancel.type = "button"
  go.addEventListener("click", () => {
    if (input && !input.value.trim()) {
      input.focus()
      return
    }
    const body = move ? { status: move.to, supersededBy: input?.value.trim() } : { approve: true }
    commit(chip, body, menu)
  })
  cancel.addEventListener("click", () => step.replaceChildren())
  row.append(go, cancel)
  step.appendChild(row)
  ;(input ?? go).focus()
}

function renderMenu(chip: HTMLElement, state: StatusState, note = "") {
  document.getElementById(MENU_ID)?.remove()
  const menu = el("div", "")
  menu.id = MENU_ID
  menu.setAttribute("role", "menu")

  const options: { label: string; note: string; move: Move | null }[] = (state.moves ?? []).map(
    (move) => ({ label: move.to, note: move.note, move }),
  )
  if (state.canApprove) {
    options.push({ label: "approve", note: "Add my name to the approvals", move: null })
  }
  if (options.length === 0) {
    menu.appendChild(el("p", "wiki-status-empty", "Nothing to change from here."))
  }
  for (const option of options) {
    const item = el("button", "wiki-status-option")
    item.type = "button"
    item.setAttribute("role", "menuitem")
    const chipClass = option.move ? `status-chip status-${option.move.to}` : "wiki-status-approve"
    item.append(el("span", chipClass, option.label), el("span", "wiki-status-note", option.note))
    item.addEventListener("click", () => confirmStep(chip, menu, state, option.move))
    menu.appendChild(item)
  }
  menu.append(el("div", "wiki-status-confirm"), el("p", "wiki-status-message", note))

  const rect = chip.getBoundingClientRect()
  menu.style.top = `${rect.bottom + window.scrollY + 6}px`
  menu.style.left = `${Math.max(12, rect.left + window.scrollX)}px`
  document.body.appendChild(menu)
  chip.setAttribute("aria-expanded", "true")
}

function onDocumentClick(e: MouseEvent) {
  const menu = document.getElementById(MENU_ID)
  const target = e.target as HTMLElement | null
  if (!menu || !target || !document.contains(target)) return
  if (menu.contains(target) || target.closest(".status-chip.status-editable")) return
  closeMenu()
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && document.getElementById(MENU_ID)) closeMenu()
}

document.addEventListener("click", onDocumentClick)
document.addEventListener("keydown", onKey)

document.addEventListener("nav", async () => {
  closeMenu()
  const source = badge()
  const chip = source?.querySelector<HTMLElement>(".status-chip")
  if (!source || !chip) return

  let state: StatusState
  try {
    const res = await fetch(`/api/status?path=${encodeURIComponent(source.dataset.pagePath!)}`)
    if (!res.ok) return
    state = (await res.json()) as StatusState
  } catch {
    return
  }
  // The reader may have moved on while the request was out.
  if (!state.canEdit || !document.contains(chip)) return

  chip.dataset.state = JSON.stringify(state)
  chip.classList.add("status-editable")
  chip.setAttribute("role", "button")
  chip.setAttribute("tabindex", "0")
  chip.setAttribute("aria-haspopup", "menu")
  chip.setAttribute("aria-expanded", "false")
  chip.title = "Change the status of this page"

  const open = () => {
    if (document.getElementById(MENU_ID)) {
      closeMenu()
      return
    }
    renderMenu(chip, JSON.parse(chip.dataset.state || "{}") as StatusState)
  }
  const onChipKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      open()
    }
  }
  chip.addEventListener("click", open)
  chip.addEventListener("keydown", onChipKey)
  window.addCleanup(() => {
    chip.removeEventListener("click", open)
    chip.removeEventListener("keydown", onChipKey)
  })
})
