/*
 * Front-end-only login. NOT real security: anyone can read config.js and this file.
 * It only keeps each manager on their own section's form.
 */
(function () {
  const KEY = 'athar:session';

  // Compact pure-JS SHA-256, used only when Web Crypto is unavailable (plain http on a LAN).
  function sha256Fallback(str) {
    const bytes = new TextEncoder().encode(str);
    const K = [];
    for (let i = 2, n = 0; n < 64; i++) {
      let p = true;
      for (let j = 2; j * j <= i; j++) if (i % j === 0) { p = false; break; }
      if (p) { K[n++] = (Math.pow(i, 1 / 3) % 1) * 4294967296 | 0; }
    }
    const H = [];
    for (let i = 2, n = 0; n < 8; i++) {
      let p = true;
      for (let j = 2; j * j <= i; j++) if (i % j === 0) { p = false; break; }
      if (p) { H[n++] = (Math.sqrt(i) % 1) * 4294967296 | 0; }
    }
    const l = bytes.length, total = (((l + 8) >> 6) + 1) << 6;
    const m = new Uint8Array(total);
    m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 4, l * 8, false);
    dv.setUint32(total - 8, Math.floor(l / 536870912), false);
    const rr = (x, n) => (x >>> n) | (x << (32 - n));
    const w = new Array(64);
    for (let o = 0; o < total; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
        const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
        const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  async function sha256(str) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return sha256Fallback(str);
  }

  function getSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      const cfg = window.ATHAR_CONFIG;
      if (!s || !cfg) return null;
      // Re-validate against config so a forged sessionStorage value is useless.
      const acc = cfg.accounts.find((a) => a.section === s.section && a.email === s.email);
      if (!acc || !window.ATHAR_TEMPLATES[s.section]) return null;
      return { section: acc.section, email: acc.email, manager: acc.manager || '' };
    } catch (e) { return null; }
  }

  async function login(email, password) {
    const cfg = window.ATHAR_CONFIG;
    const e = String(email || '').trim().toLowerCase();
    const h = await sha256(password || '');
    const acc = cfg.accounts.find((a) => a.email.toLowerCase() === e && a.hash === h);
    if (!acc) return null;
    sessionStorage.setItem(KEY, JSON.stringify({ section: acc.section, email: acc.email }));
    return acc;
  }

  function logout() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    location.replace('index.html');
  }

  // Call at the top of every protected page. Redirects to login when there is no valid session.
  function requireSession() {
    const s = getSession();
    if (!s) { location.replace('index.html'); return null; }
    return s;
  }

  window.AtharAuth = { sha256, login, logout, getSession, requireSession };
})();
