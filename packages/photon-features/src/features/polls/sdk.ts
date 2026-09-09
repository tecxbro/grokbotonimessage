import { poll, option, type ContentBuilder, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

/** Public Spectrum 12.8.0 builders. Caller keys are not native option identifiers. */
export function compilePoll(question: string, choices: readonly { key: string; label: string }[]): ContentBuilder {
  if (!question.trim() || new Set(choices.map(o => o.key)).size !== choices.length ||
      choices.some(o => !o.label.trim())) throw new Error("INVALID_REQUEST");
  return poll(question, choices.map(o => option(o.label)));
}

export function checkedSpace(space: Space): Space {
  if (space.__platform !== "imessage" || !imessage(space).phone) throw new Error("UNSUPPORTED");
  return space;
}
