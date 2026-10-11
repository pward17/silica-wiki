// The status changes a person may make from the page, as content/meta/
// status-model.md draws them. Everything else stays a hand edit.
export const MOVES = {
  slop: ["draft", "active", "dropped"],
  draft: ["active", "dropped"],
  active: ["superseded", "dropped", "slop"],
  superseded: [],
  dropped: [],
}

// What each move does besides the status itself, said on the menu so nobody
// finds out after the commit.
export const MOVE_NOTES = {
  draft: "A reasonable start, not settled yet",
  active: "I read every line and vouch for it",
  superseded: "A newer page replaces this one",
  dropped: "No longer matters, nothing replaces it",
  slop: "Back to unread: clears every approval",
}

const today = () => new Date().toISOString().slice(0, 10)

// The approvals a move leaves behind. Going active stamps the person making
// the move (refreshing their date if they were there already); going back to
// slop clears every vouch, since the lint refuses slop with an approval.
export function approvalsAfter(status, approvals, name) {
  if (status === "slop") return []
  if (status === "active") {
    const others = approvals.filter((a) => a.who.toLowerCase() !== name.toLowerCase())
    return [...others, { who: name, when: today() }]
  }
  return approvals
}

export { today }
