import { createHash } from "node:crypto";
import { scopeSchema, type Scope } from "../../contracts/index.js";

/** Provider identifiers are opaque (iMessage chat GUIDs contain semicolons).
 * Keep the original in the durable capture; never feed it into F0's ID grammar. */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
export const opaqueId = (kind: string, ...parts: unknown[]): string =>
  `${kind}:${createHash("sha256").update(canonicalJson(parts)).digest("hex")}`;
export const scopeKey = (s: Scope): string =>
  JSON.stringify([s.projectId, s.provider, s.accountId, s.lineId, s.spaceId]);
export interface LineBinding {
  accountId: string;
  lineId: string;
  phone: string;
}
export class ProviderContext {
  private readonly lines: readonly LineBinding[];
  constructor(
    readonly projectId: string,
    lines: readonly LineBinding[],
  ) {
    if (
      !lines.length ||
      new Set(lines.map((l) => l.phone)).size !== lines.length ||
      new Set(lines.map((l) => l.lineId)).size !== lines.length
    )
      throw new Error("AMBIGUOUS_LINE_BINDINGS");
    for (const line of lines) {
      if (!line.phone) throw new Error("MISSING_PHONE");
      scopeSchema.parse({
        projectId,
        provider: "imessage",
        ...{ accountId: line.accountId, lineId: line.lineId },
        spaceId: "validation",
      });
    }
    this.lines = lines.map((l) => Object.freeze({ ...l }));
  }
  inbound(phone: string, conversationId: string): Scope {
    const line = this.lines.find((l) => l.phone === phone);
    if (!line || !conversationId) throw new Error("UNBOUND_PROVIDER_ROUTE");
    return {
      projectId: this.projectId,
      provider: "imessage",
      accountId: line.accountId,
      lineId: line.lineId,
      spaceId: opaqueId("space", conversationId),
    };
  }
  outbound(scope: Scope, conversationId: string): { phone: string } {
    const line = this.lines.find(
      (l) => l.lineId === scope.lineId && l.accountId === scope.accountId,
    );
    if (
      !line ||
      scope.provider !== "imessage" ||
      scope.projectId !== this.projectId ||
      scope.spaceId !== opaqueId("space", conversationId)
    )
      throw new Error("SCOPE_MISMATCH");
    return { phone: line.phone };
  }
  evidence() {
    return this.lines.map(({ accountId, lineId }) => ({ accountId, lineId }));
  }
}
