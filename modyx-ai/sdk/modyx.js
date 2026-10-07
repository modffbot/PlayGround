/* MODYX SDK for JavaScript — use MODYX API from your apps.
 * Docs: /api/docs  |  Get a key: app → API Platform tab
 * const { Modyx } = require('./modyx.js'); const ai = new Modyx({ base: 'http://localhost:3000', key: 'mky_...' });
 */
class Modyx {
  constructor({ base = 'http://localhost:3000', key = '' } = {}) {
    this.base = String(base).replace(/\/$/, '');
    this.key = key;
  }
  async _call(path, body) {
    const r = await fetch(this.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.key },
      body: JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  models() {
    return fetch(this.base + '/api/v1/models', { headers: { 'x-api-key': this.key } }).then((r) => r.json());
  }
  chat(message) { return this._call('/api/v1/chat', { message }); }
}
if (typeof module !== 'undefined') module.exports = { Modyx };
