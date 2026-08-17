const { PLANS } = require("./plans");

function randomSuffix(n = 8) {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < n; i += 1) {
    out += letters[Math.floor(Math.random() * letters.length)];
  }
  return out;
}

async function createCheckoutSession(stripe, plan, baseUrl) {
  const successUrl = `${baseUrl}/shop-success.html?session_id={CHECKOUT_SESSION_ID}&provider=stripe`;
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
