// Progress for the background jobs (a screener scan, a watchlist update), so pages can show a
// filling bar, what is happening now and roughly how long is left. Each step's expected time is
// learned from earlier runs (a moving average kept in the owner's saved file), so the estimates
// settle to this machine, network and model.

const LEARN = 0.3; // weight of the newest timing in the moving average

class Progress {
  /**
   * @param phases [{ key, label }] in order
   * @param timing { [key]: ms } expected time per step (per unit for counted phases); updated in place
   */
  constructor(phases, timing) {
    this.phases = phases;
    this.timing = timing;
    this.units = {};
    this.current = null;
    this.startedAt = 0;
  }

  start() {
    this.startedAt = Date.now();
    this.current = null;
    this.units = Object.fromEntries(this.phases.map((p) => [p.key, 1]));
  }

  /** How many units a phase will take this run, e.g. how many stocks Legend will grade. */
  plan(key, units) {
    this.units[key] = Math.max(0, units);
  }

  /** Begin a phase, or the next unit of one. The step before it ends here and is learned from. */
  step(key, unit = 0) {
    this.end();
    this.current = { key, unit, at: Date.now(), done: 0, total: 0 };
    return this.snapshot();
  }

  /** Count items done within the step, e.g. 12 of 34 floats looked up. */
  count(done, total) {
    if (!this.current) return null;
    this.current.done = done;
    this.current.total = total;
    return this.snapshot();
  }

  /** Stop the clock on the current step without learning from it (it was interrupted). */
  hold() {
    const snap = this.current ? { ...this.snapshot(), held: true } : null;
    this.current = null;
    return snap;
  }

  end() {
    const c = this.current;
    this.current = null;
    if (!c) return;
    const took = Date.now() - c.at;
    const before = this.timing[c.key];
    this.timing[c.key] = Math.round(Number.isFinite(before) ? before * (1 - LEARN) + took * LEARN : took);
  }

  snapshot() {
    const c = this.current;
    if (!c) return null;
    const index = this.phases.findIndex((p) => p.key === c.key);
    const stepEstimateMs = this.timing[c.key] || 1000;
    let afterMs = Math.max(0, (this.units[c.key] || 1) - c.unit - 1) * stepEstimateMs;
    for (const p of this.phases.slice(index + 1)) afterMs += (this.units[p.key] ?? 1) * (this.timing[p.key] || 1000);
    const elapsed = c.at - this.startedAt;
    const whole = elapsed + stepEstimateMs + afterMs || 1;
    return {
      phases: this.phases.filter((p) => this.units[p.key] !== 0).map((p) => ({ key: p.key, label: p.label })),
      phase: c.key,
      unit: c.unit,
      units: this.units[c.key] || 1,
      startedAt: this.startedAt,
      stepStartedAt: c.at,
      stepEstimateMs,
      afterMs,
      from: elapsed / whole,
      to: (elapsed + stepEstimateMs) / whole,
      done: c.done,
      total: c.total,
    };
  }
}

module.exports = { Progress };
