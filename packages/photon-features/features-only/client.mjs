import { bindFeatureClient } from './client-core.mjs';
/** Bind feature calls to an existing authenticated execution port.
 * Requires the normal package build. This is not a sender, installer, or authorization layer.
 * No fallback parser is used: missing compiled canonical contracts is a load failure.
 */
export async function createPhotonFeatureClient(binding) {
  const { parseActionRequest } = await import('../dist/src/contracts/actions.js');
  return bindFeatureClient(binding, parseActionRequest);
}
