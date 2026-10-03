# Structural tells

Sentence shapes and page shapes that mark generated text. These matter more than vocabulary: a writer can swap words and keep every one of these habits.

## Sentence shapes

**The negative pivot.** "It's not just a cache, it's a fundamental rethink of how we serve reads." The construction promises depth and delivers emphasis. Say the thing: "This is a read-through cache in front of Postgres."

**The rule of three.** "Fast, reliable, and cost-effective." Three parallel items of equal length, chosen for rhythm rather than because there are exactly three. Keep the one that carries information.

**Hedge cascades.** "This could potentially may be able to help." One hedge is honest, three is noise. Either the claim holds or it needs a source.

**Process narration.** "After reviewing the available sources, an examination shows..." How you arrived at a finding is not content. State the finding.

**Vague attribution.** "Studies show", "experts agree", "it is widely understood", "the team decided". Name who, link where, or drop the sentence.

**False balance.** "Both approaches have merit and the right choice depends on context." True and useless. A wiki page picks, and records why; if the choice is genuinely open, that is a decision page with `status: open` and the options written out.

**Announced noteworthiness.** "It's worth noting that", "importantly", "notably". If it is worth noting, note it; the announcement adds nothing.

## Page shapes

**Hollow openers and closers.** "In today's fast-paced environment..." and "In conclusion, this component plays a vital role." A wiki page opens with its definition and stops when the content stops. No summary section, no key takeaways box.

**Fake completeness.** Every aspect covered in two sentences each. A page that says a little about everything is a page nobody can act on. Cover what you actually know; leave the rest to `## Open questions`.

**Duplication.** Explaining something a neighbouring page already owns. Link instead. Duplicated content is the main way a wiki starts contradicting itself.

**Decoration.** Emoji, checkmark bullets, horizontal rules between sections, tables where two sentences would do, deep heading nesting on a short page, title-case headings. None of it belongs on a page.

**Em dashes.** House rule: never. Colon, comma, parentheses, full stop.

## The content-level failures that no linter catches

These are the ones that actually poison a wiki, and only a human review pass finds them:

- Confident specifics that were never checked: a limit, a path, a field name, a number.
- Describing what the code does instead of why the design is that way.
- Generic best-practice advice not tied to this system.
- Text that was true when written and reads as current because nothing marks its age.
