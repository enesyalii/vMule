/** vMule server shop plans (shared node packs only). */
const PLANS = {
  starter: {
    id: "starter",
    name: "vMule Starter Node",
    tagline: "A reliable shared VMLF node for everyday sharing.",
    amount: 499,
    currency: "usd",
    interval: "month",
    mode: "subscription",
    connections: 80,
    features: [
      "Shared VMLF node, High ID",
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
      "Priority queue access",
    ],
  },
};

module.exports = { PLANS };
