const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const CATALOG = require('../lib/catalog');
const { callSheet } = require('../lib/sheets');

module.exports = async (req, res) => {
  try {
    const { items, vipCode } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Panier vide ou invalide' });
    }

    // 1. Panier reconstruit côté serveur (les prix viennent du catalogue, pas du navigateur)
    const cart = [];
    for (const it of items) {
      const art = CATALOG[String(it.id)];
      if (!art) return res.status(400).json({ error: 'Œuvre inconnue.' });
      if (art.stock <= 0) return res.status(400).json({ error: `« ${art.title} » n'est plus disponible.` });
      cart.push({ id: String(it.id), title: art.title, price: art.price });
    }

    // 2. Code VIP vérifié dans le Google Sheet
    let vip = null;
    if (vipCode) {
      const r = await callSheet({ action: 'verify', code: String(vipCode).trim().toUpperCase() });
      if (!r.valid) return res.status(400).json({ error: 'Code VIP invalide.', vipInvalid: true });
      vip = { code: String(vipCode).trim().toUpperCase(), email: r.email };
    }

    // 3. Livraison / assurance (calculée sur la valeur réelle, avant remise)
    const total = cart.reduce((s, i) => s + i.price, 0);
    let shippingCost = 35;
    if (total >= 500 && total <= 1500) shippingCost = 60;
    else if (total > 1500) shippingCost = 95;
    const freeShipping = !!vip && total >= 500;   // avantage VIP : livraison offerte dès 500 €

    // 4. Lignes Stripe (−10 % pour les VIP)
    const lineItems = cart.map(i => ({
      price_data: {
        currency: 'eur',
        product_data: { name: i.title + (vip ? ' — Tarif spécial VIP (−10 %)' : '') },
        unit_amount: Math.round(i.price * (vip ? 90 : 100)),   // en centimes
      },
      quantity: 1,
    }));

    if (!freeShipping) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Livraison sécurisée & Assurance Ad Valorem',
            description: 'Inclus emballage blindé sur-mesure, transporteur prioritaire suivi et assurance perte/casse sur la valeur réelle.',
          },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      });
    }

    const origin = req.headers.origin || 'https://olivier-salvatge-gallerie.vercel.app';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      ...(vip ? { customer_email: vip.email } : {}),
      phone_number_collection: { enabled: true },
      shipping_address_collection: {
        allowed_countries: ['FR', 'BE', 'CH', 'LU', 'DE', 'IT', 'ES', 'GB', 'US', 'CA'],
      },
      custom_text: {
        submit: {
          message: "En commandant, vous rejoignez le Cercle des collectionneurs : un code personnel (−10 % sur vos prochains achats) vous sera envoyé par e-mail, ainsi que des invitations aux avant-premières et vernissages. Désinscription possible à tout moment.",
        },
      },
      metadata: {
        artworks: cart.map(i => i.id).join(','),
        vip_code: vip ? vip.code : '',
      },
      success_url: `${origin}?payment=success`,
      cancel_url: `${origin}?payment=cancelled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Erreur Stripe Checkout:', error);
    return res.status(500).json({ error: error.message });
  }
};