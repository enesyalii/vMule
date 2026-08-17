/** Advance engine simulation on serverless hosts (no background interval). */
function tickServerless(engine) {
  if (!process.env.VERCEL && !process.env.VMULE_SERVERLESS) return;

  const now = Date.now();
  if (!engine._serverlessLastTick) engine._serverlessLastTick = now;

  const elapsed = now - engine._serverlessLastTick;
  const steps = Math.min(30, Math.max(1, Math.floor(elapsed / 1000)));
  for (let i = 0; i < steps; i += 1) engine.tick();
  engine._serverlessLastTick = now;
}

module.exports = { tickServerless };
