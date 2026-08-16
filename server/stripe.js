const PLANS = {
  starter: {
    id: "starter",
    name: "vMule Starter Node",
    tagline: "A reliable shared ED2K node for everyday sharing.",
    amount: 499,
    currency: "usd",
    interval: "month",
    mode: "subscription",
    connections: 80,
    features: [
      "Shared ED2K node, High ID",
      "80 concurrent connections",
      "Kad bootstrap included",
      "Email support",
    ],
  },
  pro: {
    id: "pro",
    name: "vMule Pro Node",
    tagline: "More slots, faster queues, priority Kad.",
    amount: 1299,
    currency: "usd",
    interval: "month",
    mode: "subscription",
    connections: 400,
    features: [
      "Priority shared node, High ID",
      "400 concurrent connections",
      "Source exchange boost",
      "Control panel remote access",
    ],
  },
  dedicated: {
    id: "dedicated",
    name: "vMule Dedicated Server",
    tagline: "Your own ED2K server. Name it, list it, run it.",
    amount: 2999,
    currency: "usd",
    interval: "month",
    mode: "subscription",
    connections: 5000,
    dedicated: true,
    features: [
      "Dedicated ED2K server process",
      "Custom server name & description",
      "Up to 5,000 users",
      "Listed in the official server.met",
    ],
  },
  kadboost: {
    id: "kadboost",
    name: "Kad Boost Pack",
    tagline: "One-time nodes.dat pack and firewall helper.",
    amount: 999,
    currency: "usd",
    interval: null,
    mode: "payment",
    connections: 0,
    features: [
      "Fresh Kad nodes.dat",
      "Obfuscated UDP helper",
      "Lifetime download",
    ],
  },
};

function randomSuffix(n = 8) {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < n; i += 1) {
    out += letters[Math.floor(Math.random() * letters.length)];
  }
  return out;
}

async function createCheckoutSession(stripe, plan, baseUrl) {
  const successUrl = `${baseUrl}/shop-success.html?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/shop-cancel.html`;

  const priceData = {
    currency: plan.currency,
    product_data: {
      name: plan.name,
      description: plan.tagline,
    },
    unit_amount: plan.amount,
  };
  if (plan.mode === "subscription") {
    priceData.recurring = { interval: plan.interval };
  }

  return stripe.checkout.sessions.create({
    mode: plan.mode,
    line_items: [{ price_data: priceData, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { plan_id: plan.id, product: "vmule-server" },
    integration_identifier: `vmule_shop_${randomSuffix()}`,
  });
}

module.exports = { PLANS, createCheckoutSession, randomSuffix };
