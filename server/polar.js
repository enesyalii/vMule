const config = require("./config");

let PolarClass = null;
let validateEventFn = null;
let WebhookVerificationErrorClass = null;

function loadPolarSdk() {
  if (PolarClass) return;
  const { Polar } = require("@polar-sh/sdk");
  const webhooks = require("@polar-sh/sdk/webhooks.js");
  PolarClass = Polar;
  validateEventFn = webhooks.validateEvent;
  WebhookVerificationErrorClass = webhooks.WebhookVerificationError;
}

function createPolarClient() {
  if (!config.POLAR_ACCESS_TOKEN) return null;
  try {
    loadPolarSdk();
    return new PolarClass({
      accessToken: config.POLAR_ACCESS_TOKEN,
      server: config.POLAR_SANDBOX ? "sandbox" : "production",
    });
  } catch (err) {
    console.warn(`Polar SDK unavailable: ${err.message}`);
    return null;
  }
}

function polarProductId(plan) {
  const fromPlan = plan.polarProductId;
  if (fromPlan) return fromPlan;
  return config.POLAR_PRODUCT_IDS[plan.id] || "";
}

async function createPolarCheckout(polar, plan, baseUrl) {
  const productId = polarProductId(plan);
  if (!productId) {
    throw new Error(`Polar product not configured for plan "${plan.id}" (set POLAR_PRODUCT_${plan.id.toUpperCase()})`);
  }

  const successUrl = `${baseUrl}/shop-success.html?checkout_id={CHECKOUT_ID}&provider=polar`;
  const checkout = await polar.checkouts.create({
    products: [productId],
    successUrl,
    metadata: { plan_id: plan.id, product: "vmule-server" },
  });

  return { id: checkout.id, url: checkout.url };
}

function planIdFromPolarPayload(data) {
  const meta = data?.metadata || data?.checkout?.metadata || {};
  if (meta.plan_id) return meta.plan_id;
  const productId = data?.product?.id || data?.product_id;
  if (productId) {
    for (const [id, pid] of Object.entries(config.POLAR_PRODUCT_IDS)) {
      if (pid === productId) return id;
    }
  }
  return null;
}

function verifyPolarWebhook(body, headers) {
  if (!config.POLAR_WEBHOOK_SECRET) {
    throw new Error("POLAR_WEBHOOK_SECRET is not configured");
  }
  loadPolarSdk();
  return validateEventFn(body, headers, config.POLAR_WEBHOOK_SECRET);
}

function polarWebhookError(err) {
  return WebhookVerificationErrorClass && err instanceof WebhookVerificationErrorClass;
}

module.exports = {
  createPolarClient,
  createPolarCheckout,
  planIdFromPolarPayload,
  verifyPolarWebhook,
  polarWebhookError,
  polarProductId,
};
