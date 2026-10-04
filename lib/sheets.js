async function callSheet(payload) {
  const r = await fetch(process.env.SHEET_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, secret: process.env.SHEET_SECRET })
  });
  const txt = await r.text();
  let json;
  try { json = JSON.parse(txt); } catch { throw new Error('Réponse inattendue du Google Sheet'); }
  if (json.error) throw new Error(json.error);
  return json;
}
module.exports = { callSheet };