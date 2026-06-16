// Pure position-sizing math. Server-only by convention.

export interface Instrument {
  epic: string;
  name: string;
  type: string;
  min_stop_distance_points: number;
  tick_value_per_point: number;
}

export interface RawSignal {
  epic: string;
  name?: string;
  direction: "BUY" | "SELL";
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  confidence: number;
  justification?: string;
}

export interface BuiltOrder extends RawSignal {
  size: number;
  potential_loss: number;
}

export interface RiskParams {
  equity: number;
  realized_daily_pnl: number;
  max_risk_per_trade_pct: number;
  max_daily_loss_pct: number;
  min_confidence: number;
}

export function buildOrders(
  signals: RawSignal[],
  instruments: Instrument[],
  p: RiskParams,
): { orders: BuiltOrder[]; daily_loss_limit_hit: boolean; skipped: { sig: RawSignal; reason: string }[] } {
  const skipped: { sig: RawSignal; reason: string }[] = [];
  const maxLoss = p.equity * p.max_daily_loss_pct;
  if (p.realized_daily_pnl < 0 && Math.abs(p.realized_daily_pnl) >= maxLoss) {
    return { orders: [], daily_loss_limit_hit: true, skipped };
  }
  let remaining = p.realized_daily_pnl < 0 ? maxLoss + p.realized_daily_pnl : maxLoss;
  const orders: BuiltOrder[] = [];
  for (const sig of signals) {
    if (sig.confidence < p.min_confidence) {
      skipped.push({ sig, reason: `confidence ${sig.confidence} < ${p.min_confidence}` });
      continue;
    }
    const inst = instruments.find((i) => i.epic === sig.epic);
    if (!inst) { skipped.push({ sig, reason: "unknown epic" }); continue; }
    const stopDist = Math.abs(sig.entry_price - sig.stop_loss);
    if (stopDist <= 0) { skipped.push({ sig, reason: "zero stop distance" }); continue; }
    if (stopDist < inst.min_stop_distance_points) {
      skipped.push({ sig, reason: `stop ${stopDist} < min ${inst.min_stop_distance_points}` });
      continue;
    }
    const riskPerTrade = p.equity * p.max_risk_per_trade_pct;
    const rawSize = riskPerTrade / (stopDist * inst.tick_value_per_point);
    const size = Math.max(0, Math.round(rawSize * 100) / 100);
    if (size <= 0) { skipped.push({ sig, reason: "size <= 0" }); continue; }
    const potentialLoss = size * stopDist * inst.tick_value_per_point;
    if (potentialLoss > remaining) {
      skipped.push({ sig, reason: `loss ${potentialLoss.toFixed(2)} > remaining ${remaining.toFixed(2)}` });
      continue;
    }
    orders.push({ ...sig, size, potential_loss: potentialLoss });
    remaining -= potentialLoss;
  }
  return { orders, daily_loss_limit_hit: false, skipped };
}
