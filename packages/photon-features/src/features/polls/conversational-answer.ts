export const POLL_ANSWER_OPTION_MAX = 1000;
export const POLL_ANSWER_QUESTION_MAX = 300;
export const POLL_ANSWER_TEXT_MAX = 1600;

export interface ConversationalPollAnswer {
  optionText: string;
  question: string | null;
  selected: boolean;
  answerText: string;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const bounded = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : undefined;

/** Render user-controlled labels without allowing line breaks or control bytes to
 * impersonate our field labels. The exact strings remain available in the typed event. */
const display = (value: string): string => JSON.stringify(value).slice(1, -1);

/** Convert only the pinned public PollOption fields. `content.title` and
 * `content.option.title` must agree; `content.poll.title` is optional provenance,
 * never reconstructed from a stored poll, a label, or the latest conversation state. */
export function conversationalPollAnswer(
  value: unknown,
): ConversationalPollAnswer | undefined {
  const content = record(value);
  if (!content || content.type !== "poll_option") return;
  const contentTitle = bounded(content.title, POLL_ANSWER_OPTION_MAX);
  const optionText = bounded(
    record(content.option)?.title,
    POLL_ANSWER_OPTION_MAX,
  );
  if (
    !contentTitle ||
    !optionText ||
    contentTitle !== optionText ||
    typeof content.selected !== "boolean"
  )
    return;

  let question: string | null = null;
  if (content.poll !== undefined) {
    const poll = record(content.poll);
    if (!poll || poll.type !== "poll") return;
    const rawQuestion = poll.title;
    const parsed = bounded(rawQuestion, POLL_ANSWER_QUESTION_MAX);
    if (!parsed) return;
    question = parsed;
  }

  const action = content.selected ? "Selected" : "Deselected";
  const answerText = question
    ? `[Poll response]\nQuestion: ${display(question)}\n${action}: ${display(optionText)}`
    : `[Poll response]\n${action}: ${display(optionText)}\nSource question: not identified by the received event.`;
  if (answerText.length > POLL_ANSWER_TEXT_MAX) return;
  return { optionText, question, selected: content.selected, answerText };
}
