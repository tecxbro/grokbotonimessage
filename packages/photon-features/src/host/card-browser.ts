/** Shipped browser producer for our signed-card-v1 protocol. Private signing keys
 * stay in this origin's IndexedDB; links never contain participant credentials. */
export const cardBrowserScript = String.raw`
const status = document.getElementById('status');
const participant = document.getElementById('participant');
participant.value = localStorage.getItem('participant') || '';
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function deviceKey() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('grok-photon-participant-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    const existing = await new Promise((resolve, reject) => {
      const request = db.transaction('keys').objectStore('keys').get('device');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
    await new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite'); tx.objectStore('keys').add(key, 'device');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    return key;
  } finally { db.close(); }
}
document.getElementById('enroll').onclick = async () => {
  try {
    const key = await deviceKey(); const publicKey = await crypto.subtle.exportKey('jwk', key.publicKey);
    document.getElementById('key').textContent = JSON.stringify({ kty: publicKey.kty, crv: publicKey.crv, x: publicKey.x });
    status.textContent = 'The owner must verify your iMessage account and enroll this public key. Opening a card does not enroll you.';
  } catch { status.textContent = 'This browser cannot store an Ed25519 participant key.'; }
};
let pending;
if (binding) for (const actionId of binding.actionIds) {
  const button = document.createElement('button'); button.textContent = actionId;
  button.onclick = async () => {
    button.disabled = true;
    try {
      if (Date.now() >= binding.expiresAt) throw new Error('expired');
      const id = participant.value.trim(); if (!id) throw new Error('participant');
      localStorage.setItem('participant', id);
      if (!pending) {
        const payload = JSON.stringify({ version: 1, eventId: crypto.randomUUID(), session: binding.session,
          scope: binding.scope, taskId: binding.taskId, generation: binding.generation, participantId: id,
          nonce: binding.nonce, actionId, selection: [], occurredAt: Date.now() });
        const key = await deviceKey();
        const signature = await crypto.subtle.sign('Ed25519', key.privateKey, new TextEncoder().encode('grok-photon:signed-card-v1\n' + payload));
        pending = { version: 1, payload, signature: b64(signature) };
      }
      const response = await fetch('/interactions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pending) });
      const result = await response.json();
      if (!response.ok) throw new Error('rejected');
      status.textContent = result.status === 'unresolved' ? 'Card session is unresolved. No action was attached to another conversation.' : 'Interaction received.';
      for (const other of document.querySelectorAll('#actions button')) other.disabled = true;
    } catch { status.textContent = 'Interaction not confirmed. Check enrollment and expiry. Retry sends the same signed event.'; button.disabled = false; }
  };
  document.getElementById('actions').append(button);
}
else status.textContent = 'Preview only. No current interaction session is available.';
`;
