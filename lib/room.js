export function normalizeRoomCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function makeRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function safeName(name) {
  return String(name || '').trim().slice(0, 20).replace(/\s+/g, ' ');
}

export function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
