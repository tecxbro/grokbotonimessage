import {
  group,
  markdown,
  richlink,
  text,
  reply,
  resolveContents,
  type ContentInput,
} from "spectrum-ts";
import {
  contentSchema,
  type ContentCompiler,
  type ContentSpec,
  type ExecutionServices,
} from "../../index.js";
import { requireThat } from "./errors.js";
import { oneBubble } from "./voice-policy.js";
import { targetMessage } from "./targets.js";
import type { TextMessageOptions } from "./sdk.js";
const groupTypes = new Set([
  "text",
  "markdown",
  "attachment",
  "voice",
  "contact",
]);
export function validateContent(spec: ContentSpec): void {
  contentSchema.parse(spec);
  if (spec.type === "group") {
    requireThat(
      spec.items.length >= 2,
      "UNSUPPORTED",
      "The pinned group builder requires at least two items.",
    );
    requireThat(
      spec.items.every((item) => groupTypes.has(item.type)),
      "UNSUPPORTED",
      "iMessage groups support text, markdown, attachment, voice and contact only.",
    );
    requireThat(
      spec.items.filter(
        (item) => item.type === "text" || item.type === "markdown",
      ).length <= 1,
      "UNSUPPORTED",
      "iMessage groups accept at most one text or markdown item.",
    );
    spec.items.forEach(validateContent);
  } else if (spec.type === "compose") spec.items.forEach(validateContent);
  else if (spec.type === "reply" || spec.type === "effect") {
    requireThat(
      !(spec.type === "reply" && spec.content.type === "poll"),
      "UNSUPPORTED",
      "iMessage polls cannot be replies.",
    );
    validateContent(spec.content);
  } else if (spec.type === "poll")
    requireThat(
      new Set(spec.options.map((o) => o.key)).size === spec.options.length,
      "INVALID_REQUEST",
      "Poll keys must be unique.",
    );
}
export function createCompilers(
  options: TextMessageOptions,
): ContentCompiler[] {
  const compile = async (
    spec: ContentSpec,
    s: ExecutionServices,
  ): Promise<ContentInput> => {
    validateContent(spec);
    switch (spec.type) {
      case "text":
        return text(oneBubble(spec.text));
      // Structured payloads deliberately bypass prose transformations.
      case "markdown":
        return markdown(spec.text);
      case "link":
        requireThat(
          spec.title === undefined,
          "UNSUPPORTED",
          "Pinned richlink accepts a URL only; custom titles are unsupported.",
        );
        return richlink(spec.url);
      case "group": {
        const inputs = await Promise.all(
          spec.items.map((item) => compile(item, s)),
        );
        const resolved = await resolveContents(inputs);
        requireThat(
          resolved.length === spec.items.length &&
            resolved.every((item) => groupTypes.has(item.type)) &&
            resolved.filter(
              (item) => item.type === "text" || item.type === "markdown",
            ).length <= 1,
          "UNSUPPORTED",
          "A registered compiler returned unsupported group content.",
        );
        const builders = resolved.map((content) => ({
          build: async () => content,
        }));
        return group(builders[0]!, builders[1]!, ...builders.slice(2));
      }
      case "compose":
        throw new Error(
          "Compose must be executed through the per-child journal.",
        );
      case "reply": {
        const target = await targetMessage(spec.message, s, options);
        return reply(await compile(spec.content, s), target);
      }
      default: {
        const compiler = options
          .compilers?.()
          .find((item) => item.family === spec.type);
        requireThat(
          compiler,
          "UNAVAILABLE",
          "A required content compiler has not been registered.",
        );
        const result = await compiler.compile(spec, s);
        const built = await resolveContents([result]);
        requireThat(
          built.length === 1,
          "UNSUPPORTED",
          "A leaf compiler must return exactly one content item.",
        );
        return { build: async () => built[0]! };
      }
    }
  };
  return (["text", "markdown", "link", "group", "reply"] as const).map(
    (family) => ({ family, compile }),
  );
}
