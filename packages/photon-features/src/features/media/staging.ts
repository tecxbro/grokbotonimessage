import type { MediaStream } from "./safety.js";
import { randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, unlink, lstat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  assertScope, sameScope, stagedMediaSchema, type Claim, type Clock, type ContentSpec,
  type MediaStager, type StagedMediaRecord, type TransactionStore, type TrustedContext,
} from "../../index.js";
import { openApprovedFile } from "./file-access.js";
import { createGuardedFetcher, type FetchPolicy } from "./guarded-fetch.js";
import { metadataSchema, mediaCheckpointSchema, type MediaMetadata, type SourceMetadata } from "./metadata.js";
import { scopeHasConsumers } from "./retention.js";
import { Capacity, MAX_MEDIA_BYTES, consume, reject, sha256, validateBytes, validMime } from "./safety.js";

type Media = Extract<ContentSpec, { type: "attachment" }>["media"];
export type StagedMedia = Extract<Media, { stagingId: string }>;
export interface NativeMediaSource {
  open(ref: Extract<Media, { kind: "attachment" }>, context: TrustedContext, signal: AbortSignal): Promise<{
    stream: MediaStream; metadata: SourceMetadata;
  }>;
}
export interface StagingOptions {
  directory: string;
  approvedRoots: readonly string[];
  urls: FetchPolicy;
  store: TransactionStore;
  clock: Clock;
  native: NativeMediaSource;
  maxBytes?: number;
  timeoutMs?: number;
  concurrency?: number;
}
export interface ResolvedMedia { bytes: Uint8Array; mimeType: string; metadata?: MediaMetadata | SourceMetadata }

/** Implements F0 MediaStager; creation/import methods are trusted-host APIs, never action JSON. */
export class SafeMediaStager implements MediaStager {
  private readonly capacity: Capacity;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly fetchUrl;
  private constructor(private readonly options: StagingOptions, private readonly directory: string) {
    this.maxBytes = options.maxBytes ?? MAX_MEDIA_BYTES;
    this.timeoutMs = options.timeoutMs ?? 30000;
    if (!Number.isInteger(this.maxBytes) || this.maxBytes < 1 || this.maxBytes > MAX_MEDIA_BYTES ||
      !Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120000) reject("invalid limits");
    this.capacity = new Capacity(options.concurrency);
    this.fetchUrl = createGuardedFetcher(options.urls);
  }
  static async create(options: StagingOptions): Promise<SafeMediaStager> {
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
    const directory = await realpath(options.directory);
    const stat = await lstat(directory);
    if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) reject("staging directory must be private");
    return new SafeMediaStager(options, directory);
  }
  private signal(signal?: AbortSignal): AbortSignal {
    return AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]);
  }
  private authorize(record: StagedMediaRecord, context: TrustedContext): void {
    if (!sameScope(record.scope, context.scope) || record.principalId !== context.principalId ||
      record.taskId !== context.taskId || record.generation !== context.generation) reject("resource scope");
    // expiresAt=0 is a durable tombstone; wall-clock expiry alone cannot evict pending retries.
    if (record.expiresAt === 0 || record.relativePath !== `${record.id}.bin`) reject("released resource");
  }
  private async persist(stream: MediaStream, metadata: SourceMetadata, context: TrustedContext, claim: Claim, signal: AbortSignal): Promise<StagedMedia> {
    const id = randomUUID();
    const meta = metadataSchema.parse({ ...metadata, version: 1, stagingId: id });
    validMime(meta.mimeType);
    if (meta.source) assertScope(meta.source, context.scope);
    if (meta.size !== undefined && meta.size > this.maxBytes) reject("byte limit");
    const path = join(this.directory, `${id}.part`), final = join(this.directory, `${id}.bin`);
    const file = await open(path, "wx", 0o600);
    let committed = false;
    try {
      const size = await consume(stream, this.maxBytes, signal, async chunk => {
        let offset = 0;
        while (offset < chunk.length) {
          const { bytesWritten } = await file.write(chunk, offset, chunk.length - offset);
          if (!bytesWritten) reject("interrupted file write");
          offset += bytesWritten;
        }
      });
      await file.sync();
      await file.close();
      // The F0 output contract requires bytes. Materialization occurs only after bounded streaming.
      const verified = await this.readFile(path, signal);
      validateBytes(verified, meta.mimeType, this.maxBytes);
      if (verified.length !== size || (meta.size !== undefined && size !== meta.size)) reject("size mismatch");
      const media = { stagingId: id, sha256: sha256(verified), mimeType: meta.mimeType, bytes: size };
      await rename(path, final);
      const directory = await open(this.directory, "r");
      try { await directory.sync(); } finally { await directory.close(); }
      this.options.store.transaction(tx => {
        tx.put("stagedMedia", { id, scope: context.scope, revision: 0, principalId: context.principalId,
          taskId: context.taskId, generation: context.generation, relativePath: `${id}.bin`,
          sha256: media.sha256, mimeType: media.mimeType, bytes: size,
          expiresAt: this.options.clock.now() + 86400000 }, null);
        tx.put("checkpoints", { id: `wt04:metadata:${id}`, scope: context.scope, revision: 0,
          requestId: id, codecId: "wt04.media-metadata", codecVersion: 1,
          payloadJson: JSON.stringify({ metadata: meta, readers: [] }), nextChildIndex: 0, claim }, null);
      });
      committed = true;
      return media;
    } finally {
      await file.close().catch(() => {});
      await unlink(path).catch(() => {});
      if (!committed) await unlink(final).catch(() => {});
    }
  }
  private async readFile(path: string, signal: AbortSignal, roots = [this.directory]): Promise<Buffer> {
    const file = await openApprovedFile(path, roots);
    const chunks: Buffer[] = [];
    try {
      if ((await file.stat()).size > this.maxBytes) reject("byte limit");
      const stream = Readable.toWeb(file.createReadStream({ autoClose: false, highWaterMark: 65536 }));
      await consume(stream, this.maxBytes, signal, async chunk => { chunks.push(Buffer.from(chunk)); });
      return Buffer.concat(chunks);
    } finally { await file.close(); }
  }
  stageFile(path: string, metadata: SourceMetadata, context: TrustedContext, claim: Claim, signal?: AbortSignal): Promise<StagedMedia> {
    return this.capacity.run(async () => {
      const deadline = this.signal(signal);
      const file = await openApprovedFile(path, this.options.approvedRoots);
      try {
        if ((await file.stat()).size > this.maxBytes) reject("byte limit");
        return await this.persist(Readable.toWeb(file.createReadStream({ autoClose: false, highWaterMark: 65536 })), metadata, context, claim, deadline);
      } finally { await file.close(); }
    });
  }
  stageUrl(url: string, context: TrustedContext, claim: Claim, signal?: AbortSignal): Promise<StagedMedia> {
    return this.capacity.run(async () => {
      const deadline = this.signal(signal);
      const download = await this.fetchUrl(url, deadline);
      try { return await this.persist(download.stream, { mimeType: download.mimeType }, context, claim, deadline); }
      finally { download.close(); }
    });
  }
  stageNative(ref: Extract<Media, { kind: "attachment" }>, context: TrustedContext, claim: Claim, signal?: AbortSignal): Promise<StagedMedia> {
    return this.capacity.run(async () => {
      assertScope(ref, context.scope);
      const deadline = this.signal(signal);
      const source = await this.options.native.open(ref, context, deadline);
      try { return await this.persist(source.stream, source.metadata, context, claim, deadline); }
      finally { void source.stream.cancel().catch(() => {}); }
    });
  }
  resolve(media: Media, context: TrustedContext): Promise<ResolvedMedia> {
    return this.resolveWithSignal(media, context);
  }
  resolveWithSignal(media: Media, context: TrustedContext, signal?: AbortSignal): Promise<ResolvedMedia> {
    return this.capacity.run(async () => {
      const deadline = this.signal(signal);
      if ("kind" in media) {
        assertScope(media, context.scope);
        const source = await this.options.native.open(media, context, deadline);
        const chunks: Buffer[] = [];
        try {
          validMime(source.metadata.mimeType);
          await consume(source.stream, this.maxBytes, deadline, async chunk => { chunks.push(Buffer.from(chunk)); });
        } catch (error) { void source.stream.cancel().catch(() => {}); throw error; }
        const bytes = Buffer.concat(chunks);
        validateBytes(bytes, source.metadata.mimeType, this.maxBytes);
        if (source.metadata.size !== undefined && source.metadata.size !== bytes.length) reject("size mismatch");
        return { bytes, mimeType: source.metadata.mimeType, metadata: source.metadata };
      }
      stagedMediaSchema.parse(media);
      const readerId = randomUUID();
      const record = this.options.store.transaction(tx => {
        const stored = tx.get("stagedMedia", media.stagingId);
        if (!stored) return reject("resource not found");
        this.authorize(stored, context);
        if (stored.sha256 !== media.sha256 || stored.mimeType !== media.mimeType || stored.bytes !== media.bytes) reject("resource mismatch");
        const checkpoint = tx.get("checkpoints", `wt04:metadata:${stored.id}`);
        if (!checkpoint) reject("missing resource metadata");
        const payload = mediaCheckpointSchema.parse(JSON.parse(checkpoint.payloadJson));
        if (payload.readers.length >= 1000) reject("reader limit");
        payload.readers.push(readerId);
        tx.put("checkpoints", { ...checkpoint, revision: checkpoint.revision + 1, payloadJson: JSON.stringify(payload) }, checkpoint.revision);
        return stored;
      });
      try {
        const bytes = await this.readFile(join(this.directory, record.relativePath), deadline);
        validateBytes(bytes, record.mimeType, this.maxBytes);
        if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) reject("resource integrity");
        const checkpoint = this.options.store.transaction(tx => tx.get("checkpoints", `wt04:metadata:${record.id}`));
        const metadata = checkpoint ? mediaCheckpointSchema.parse(JSON.parse(checkpoint.payloadJson)).metadata : undefined;
        return { bytes, mimeType: record.mimeType, metadata };
      } finally {
        this.options.store.transaction(tx => {
          const checkpoint = tx.get("checkpoints", `wt04:metadata:${record.id}`);
          if (!checkpoint) reject("missing resource metadata");
          const payload = mediaCheckpointSchema.parse(JSON.parse(checkpoint.payloadJson));
          payload.readers = payload.readers.filter(id => id !== readerId);
          tx.put("checkpoints", { ...checkpoint, revision: checkpoint.revision + 1, payloadJson: JSON.stringify(payload) }, checkpoint.revision);
        });
      }
    });
  }
  /** Host maintenance: durable readers and shared consumers pin resources. Tombstone commits before unlink. */
  async collect(media: StagedMedia, context: TrustedContext): Promise<boolean> {
    const record = this.options.store.transaction(tx => {
      const stored = tx.get("stagedMedia", media.stagingId);
      if (!stored) return undefined;
      if (!sameScope(stored.scope, context.scope) || stored.principalId !== context.principalId ||
        stored.taskId !== context.taskId || stored.generation !== context.generation) reject("resource scope");
      if (stored.expiresAt === 0) return stored; // Retry a prior interrupted unlink.
      this.authorize(stored, context);
      const checkpoint = tx.get("checkpoints", `wt04:metadata:${stored.id}`);
      if (!checkpoint || mediaCheckpointSchema.parse(JSON.parse(checkpoint.payloadJson)).readers.length || scopeHasConsumers(tx, context.scope)) return undefined;
      tx.put("stagedMedia", { ...stored, expiresAt: 0, revision: stored.revision + 1 }, stored.revision);
      return stored;
    });
    if (!record) return false;
    // UUID-only generated paths; never use a caller's path, even from a corrupted record.
    if (!/^[a-f0-9-]{36}$/.test(record.id)) reject("invalid staged ID");
    await unlink(join(this.directory, `${record.id}.bin`)).catch(error => { if (error.code !== "ENOENT") throw error; });
    return true;
  }
}
