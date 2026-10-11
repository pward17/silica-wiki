// Dictation for the comment boxes: a microphone button that types what the
// reader says into the textarea, through the browser's own speech recognition
// (the Web Speech API). Nothing goes through our server. Chrome and Edge send
// the audio to their vendor's recognition service, Safari may do it on the
// device. A browser without the API (Firefox) gets no button at all.

// The API is not in TypeScript's DOM types, so this is the part we use.
interface SpeechResult {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechResultEvent extends Event {
  results: ArrayLike<SpeechResult>
}
interface SpeechErrorEvent extends Event {
  error: string
}
interface Recognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: SpeechResultEvent) => void) | null
  onerror: ((e: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
}
type RecognitionClass = new () => Recognition

// A microphone, outlined like the other icons in the comment UI.
const MIC_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4"/></svg>'

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked.",
  "service-not-allowed": "Speech recognition is not available here.",
  "audio-capture": "No microphone found.",
  network: "Speech recognition needs a connection.",
}

function recognitionClass(): RecognitionClass | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionClass
    webkitSpeechRecognition?: RecognitionClass
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// One microphone at a time across every box on the page.
let stopActive: (() => void) | null = null

export function stopDictation() {
  stopActive?.()
}

// The button for `textarea`, or null when the browser cannot dictate.
// `onStatus` shows a short message in the box's status line.
export function micButton(
  textarea: HTMLTextAreaElement,
  onStatus: (message: string) => void,
): HTMLButtonElement | null {
  const Speech = recognitionClass()
  if (!Speech) return null

  const button = document.createElement("button")
  button.type = "button"
  button.className = "wiki-comment-mic"
  button.innerHTML = MIC_ICON
  const label = (listening: boolean) => {
    const text = listening ? "Stop dictating" : "Dictate"
    button.title = text
    button.setAttribute("aria-label", text)
    button.setAttribute("aria-pressed", String(listening))
    button.classList.toggle("wiki-comment-mic-on", listening)
  }
  label(false)

  let recognition: Recognition | null = null
  // The text around the caret when dictation started; what is said goes
  // between them. `from` skips results already written in for good, which
  // happens when the reader types while the microphone is on.
  let before = ""
  let after = ""
  let from = 0
  let seen = 0

  const capture = () => {
    const caret = textarea.selectionStart ?? textarea.value.length
    before = textarea.value.slice(0, caret)
    after = textarea.value.slice(textarea.selectionEnd ?? caret)
    if (before && !/\s$/.test(before)) before += " "
  }

  const onTyped = (e: Event) => {
    if (!e.isTrusted) return
    capture()
    from = seen
  }

  const stop = () => {
    recognition?.stop()
  }
  // From outside (Send, closing the box, another microphone): late results
  // are dropped, or they would land in a box that has just been cleared. The
  // words heard so far are already in it.
  const halt = () => {
    if (recognition) recognition.onresult = null
    stop()
  }

  const start = () => {
    stopDictation()
    const rec = new Speech()
    rec.lang = document.documentElement.lang || navigator.language
    rec.continuous = true
    rec.interimResults = true
    capture()
    from = 0
    seen = 0

    rec.onresult = (e) => {
      if (!textarea.isConnected) return stop()
      seen = e.results.length
      let spoken = ""
      for (let i = from; i < e.results.length; i++) spoken += e.results[i][0].transcript
      spoken = spoken.trim()
      textarea.value = before + spoken + after
      const caret = before.length + spoken.length
      textarea.setSelectionRange(caret, caret)
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    }
    rec.onerror = (e) => {
      // "no-speech" and "aborted" end a session without anything going wrong.
      if (ERRORS[e.error]) onStatus(ERRORS[e.error])
    }
    rec.onend = () => {
      if (recognition === rec) recognition = null
      if (stopActive === halt) stopActive = null
      textarea.removeEventListener("input", onTyped)
      label(false)
    }

    try {
      rec.start()
    } catch {
      onStatus("Could not start the microphone.")
      return
    }
    recognition = rec
    stopActive = halt
    textarea.addEventListener("input", onTyped)
    onStatus("")
    label(true)
    textarea.focus()
  }

  // mousedown would take focus from the textarea and, in a compact reply box,
  // fold it shut before the click lands.
  button.addEventListener("mousedown", (e) => e.preventDefault())
  button.addEventListener("click", () => (recognition ? stop() : start()))
  return button
}
