const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const CATALOG = require('../lib/catalog');
const { callSheet } = require('../lib/sheets');

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  let event;
  try {
    const buf = await rawBody(req);
    event = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature invalide:', err.message);
    return res.status(400).send('Signature invalide');
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    if (s.payment_status === 'paid') {
      try {
        const ship = s.shipping_details || (s.collected_information && s.collected_information.shipping_details) || {};
        const a = ship.address || {};
        const ids = ((s.metadata && s.metadata.artworks) || '').split(',').filter(Boolean);
        await callSheet({
          action: 'order',
          sessionId: s.id,
          email: s.customer_details.email,
          name: ship.name || s.customer_details.name || '',
          phone: s.customer_details.phone || '',
          address: [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.country].filter(Boolean).join(', '),
          artworks: ids.map(id => (CATALOG[id] || {}).title || id).join(', '),
          total: s.amount_total / 100,
          vipCode: (s.metadata && s.metadata.vip_code) || ''
        });
      } catch (err) {
        console.error('Erreur traitement commande:', err);
        return res.status(500).send('Erreur');   // Stripe réessaiera automatiquement
      }
    }
  }
  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };