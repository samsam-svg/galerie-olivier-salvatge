const { callSheet } = require('../lib/sheets');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const code = String((req.body && req.body.code) || '').trim().toUpperCase();
  if (!/^VIP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return res.status(200).json({ valid: false });
  try {
    const r = await callSheet({ action: 'verify', code });
    return res.status(200).json({ valid: !!r.valid });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Service indisponible' });
  }
};