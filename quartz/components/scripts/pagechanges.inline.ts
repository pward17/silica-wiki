// The "What changed" button opens and closes the panel of the page's last
// change, which the build has already put on the page.
document.addEventListener("nav", () => {
  const button = document.querySelector<HTMLButtonElement>(".page-changes-toggle button")
  const panel = document.getElementById("page-changes")
  if (!button || !panel) return
  const toggle = () => {
    const open = panel.hidden
    panel.hidden = !open
    button.setAttribute("aria-expanded", String(open))
  }
  button.addEventListener("click", toggle)
  window.addCleanup(() => button.removeEventListener("click", toggle))
})
