import type { ActionRequest } from '../dist/src/contracts/actions.js';
export type FeatureInput = ActionRequest extends infer A ? A extends ActionRequest
  ? Pick<A, 'operation' | 'arguments' | 'idempotencyKey'> : never : never;
export interface FeatureBinding<C = unknown, S = unknown, R = unknown> {
  contextId(): string | Promise<string>;
  capabilities(): C | Promise<C>;
  submit(action: ActionRequest): S | Promise<S>;
  status(requestId: string): R | Promise<R>;
}
export interface PhotonFeatureClient<C = unknown, S = unknown, R = unknown> {
  prepare(input: FeatureInput): Promise<ActionRequest>;
  capabilities(): C | Promise<C>;
  execute(input: FeatureInput): Promise<S>;
  status(requestId: string): R | Promise<R>;
}
export function createPhotonFeatureClient<C, S, R>(binding: FeatureBinding<C, S, R>): Promise<PhotonFeatureClient<C, S, R>>;
