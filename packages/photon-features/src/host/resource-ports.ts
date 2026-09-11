import type { ExecutionServices } from "../contracts/services.js";
import type { AuthenticatedPrincipal, ResourceRef, TrustedContext } from "../contracts/index.js";
import type { MediaOperationOptions } from "../features/media/sdk.js";
import {
  GuardedMediaStager,
  createMediaResourceCapacity,
} from "../features/media/staging.js";
import { publicNativeMediaSource } from "../features/media/sdk.js";
import type { ProductionStreamRegistry } from "./stream-registry.js";
import type { DurableSQLiteStore } from "../adapters/state/sqlite.js";
import type { DurableContexts } from "../runtime/core/authorization.js";
import type { SourceMetadata } from "../features/media/metadata.js";
import { resourceMetadataSchema, type StagedMedia } from "../features/media/staging.js";
import { RETAINED } from "../features/media/retention.js";
import { MAX_MEDIA_BYTES, sha256, validateBytes } from "../features/media/safety.js";
import { openApprovedFile } from "../features/media/file-access.js";
import { mkdir, open, realpath, rename, unlink, lstat } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { canonical } from "../runtime/core/idempotency.js";

export interface ProductionResourcePortOptions {
  stagingDirectory: string;
  approvedRoots: readonly string[];
  provider: MediaOperationOptions["provider"];
  streams: ProductionStreamRegistry;
  mediaConcurrency?: number;
  store: DurableSQLiteStore;
  contexts: DurableContexts;
  principal: AuthenticatedPrincipal;
}

/**
 * Shared policy/capacity with request-local authority. The WeakMap key is the
 * frozen execution facade, so a stager can never be reused by another claim.
 */
export class ProductionResourcePorts {
  private readonly media = new WeakMap<ExecutionServices, Promise<GuardedMediaStager>>();
  private readonly capacity;

  constructor(private readonly options: ProductionResourcePortOptions) {
    this.capacity = createMediaResourceCapacity(options.mediaConcurrency ?? 4);
  }

  mediaFor(services: ExecutionServices): Promise<GuardedMediaStager> {
    let pending = this.media.get(services);
    if (!pending) {
      pending = GuardedMediaStager.create({
        directory: this.options.stagingDirectory,
        approvedRoots: this.options.approvedRoots,
        urls: { approvedHosts: [] },
        services,
        native: publicNativeMediaSource(services, this.options.provider),
        capacity: this.capacity,
      });
      this.media.set(services, pending);
    }
    return pending;
  }

  async bind(requestId: string, services: ExecutionServices) {
    return {
      media: await this.mediaFor(services),
      streams: this.options.streams.bind(requestId, services),
    };
  }

  async stageAttachment(
    reference: Extract<ResourceRef, { kind: "attachment" }>,
    services: ExecutionServices,
  ) {
    return (await this.mediaFor(services)).stage({ type: "native", attachment: reference }, services.context as TrustedContext);
  }

  /**
   * Authenticated host-only import. The caller supplies only a basename inside
   * the configured private import directory; action JSON never accepts paths.
   * The returned descriptor is consumed later through the same guarded port.
   */
  async importFile(
    principal: AuthenticatedPrincipal,
    contextId: string,
    filename: string,
    metadata: SourceMetadata,
  ): Promise<StagedMedia> {
    if (
      principal.id !== this.options.principal.id ||
      principal.credentialId !== this.options.principal.credentialId ||
      principal.osUid !== this.options.principal.osUid ||
      basename(filename) !== filename || !/^[A-Za-z0-9_. -]{1,200}$/.test(filename) ||
      filename === "." || filename === ".."
    ) throw new Error("FORBIDDEN");
    const context = await this.options.contexts.resolve(principal, contextId);
    const importDirectory = await realpath(this.options.approvedRoots[0]!);
    const importStat = await lstat(importDirectory);
    if (!importStat.isDirectory() || importStat.isSymbolicLink() || importStat.uid !== process.getuid?.() || (importStat.mode & 0o777) !== 0o700)
      throw new Error("PRIVATE_DIRECTORY_REQUIRED");
    await mkdir(this.options.stagingDirectory, { recursive: true, mode: 0o700 });
    const stagingDirectory = await realpath(this.options.stagingDirectory);
    const stagingStat = await lstat(stagingDirectory);
    if (!stagingStat.isDirectory() || stagingStat.isSymbolicLink() || stagingStat.uid !== process.getuid?.() ||
      (stagingStat.mode & 0o777) !== 0o700) throw new Error("PRIVATE_DIRECTORY_REQUIRED");
    const input = await openApprovedFile(join(importDirectory, filename), [importDirectory]);
    let bytes: Buffer;
    try {
      const stat = await input.stat();
      if (stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > MAX_MEDIA_BYTES)
        throw new Error("MEDIA_REJECTED");
      bytes = await input.readFile();
    } finally { await input.close(); }
    validateBytes(bytes, metadata.mimeType, MAX_MEDIA_BYTES);
    const id = randomUUID();
    const parsed = resourceMetadataSchema.parse({ ...metadata, size: bytes.length, version: 1, stagingId: id });
    const metadataBytes = Buffer.from(JSON.stringify(parsed));
    const name = `${id}.${sha256(metadataBytes)}`;
    const partial = join(stagingDirectory, `${id}.part`);
    const output = join(stagingDirectory, `${name}.bin`);
    const metadataPath = join(stagingDirectory, `${name}.json`);
    let published = false;
    try {
      const file = await open(partial, "wx", 0o600);
      try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
      const meta = await open(metadataPath, "wx", 0o600);
      try { await meta.writeFile(metadataBytes); await meta.sync(); } finally { await meta.close(); }
      await rename(partial, output);
      const directory = await open(stagingDirectory, "r");
      try { await directory.sync(); } finally { await directory.close(); }
      const media = { stagingId: id, sha256: sha256(bytes), mimeType: parsed.mimeType, bytes: bytes.length };
      this.options.store.transaction(tx => {
        const current = this.options.contexts.current(tx, principal.id, contextId);
        if (canonical(current) !== canonical(context)) throw new Error("STALE_GENERATION");
        tx.put("stagedMedia", { id, scope: context.scope, revision: 0, principalId: context.principalId,
          taskId: context.taskId, generation: context.generation, relativePath: `${name}.bin`,
          sha256: media.sha256, mimeType: media.mimeType, bytes: media.bytes, expiresAt: RETAINED }, null);
      });
      published = true;
      return media;
    } finally {
      await unlink(partial).catch(() => {});
      if (!published) {
        await unlink(output).catch(() => {});
        await unlink(metadataPath).catch(() => {});
      }
    }
  }
}
