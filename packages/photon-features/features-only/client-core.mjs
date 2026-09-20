/** Feature-request client. Never constructs a provider, subscribes, retries, or grants access.
 * The bound submit/status functions remain the existing authenticated execution boundary.
 */
export function bindFeatureClient(binding, parseActionRequest) {
  if (!binding || typeof binding !== 'object' || typeof parseActionRequest !== 'function')
    throw new TypeError('FEATURE_BINDING_REQUIRED');
  for (const name of ['contextId', 'capabilities', 'submit', 'status']) {
    if (typeof binding[name] !== 'function') throw new TypeError(`FEATURE_BINDING_REQUIRED:${name}`);
  }
  // Capture functions once so later replacement cannot silently select another transport.
  const ports = Object.fromEntries(['contextId','capabilities','submit','status'].map(name => [name, binding[name].bind(binding)]));
  function ownData(input, required) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(input)))
      throw new TypeError('FEATURE_INPUT_MUST_BE_DATA');
    const keys = Reflect.ownKeys(input);
    if (keys.length !== required.length || keys.some(key => !required.includes(key)))
      throw new TypeError('FEATURE_INPUT_FIELDS');
    const output = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor.enumerable || !('value' in descriptor)) throw new TypeError('FEATURE_INPUT_MUST_BE_DATA');
      output[key] = descriptor.value;
    }
    return output;
  }
  async function prepare(input) {
    const data = ownData(input, ['operation','arguments','idempotencyKey']);
    // Detach ordinary JSON before the async context read; the canonical parser rejects
    // getters, cycles, executable values and oversized/nested input before submission.
    // Context is supplied by the authenticated binding, never a caller override.
    const first = parseActionRequest({version:1,contextId:'feature-validation',...data});
    const contextId = await ports.contextId();
    return parseActionRequest({...first,contextId});
  }
  return Object.freeze({
    prepare,
    capabilities: () => ports.capabilities(),
    async execute(input) { return ports.submit(await prepare(input)); },
    status(requestId) {
      if (typeof requestId !== 'string' || !/^[A-Za-z0-9_:+.@/-]{1,200}$/.test(requestId))
        throw new TypeError('FEATURE_REQUEST_ID_INVALID');
      return ports.status(requestId);
    },
  });
}
