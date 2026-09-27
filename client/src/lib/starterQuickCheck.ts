import { choices, placeChoices, type QaidaChoice } from "@shared/qaidaExercises";

/**
 * The Starter quick-check options for one letter tile.
 *
 * The quick check asks "which name matches this letter?" with three buttons.
 * Listing the right answer first would let a child pass every check by always
 * tapping the first button without reading anything — the same failure class
 * the course itself fixed with `placeChoices`. So the options go through the
 * same deterministic rotation, keyed by letter index: the same letter always
 * shows the same order (tests and screenshots don't drift), but the correct
 * answer moves across positions from letter to letter.
 */
export function starterQuickCheckChoices(
  letterIndex: number,
  correctName: string,
  distractorNames: [string, string],
): QaidaChoice[] {
  return placeChoices(
    `starter-quickcheck-letter-${letterIndex}`,
    choices([
      { label: correctName, correct: true },
      { label: distractorNames[0] },
      { label: distractorNames[1] },
    ]),
  );
}
