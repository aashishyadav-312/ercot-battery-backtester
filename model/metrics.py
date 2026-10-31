"""Revenue metrics: $/kW-yr, monthly revenue, top-10-day share, dispatch heatmap.

All revenue figures are per kW of power capacity, the usual way storage revenue
is quoted. A partial year (for example 2026 year-to-date) is annualized by
scaling to 365 days and flagged with "annualized": true.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def summarize(result: dict) -> dict:
    """Metrics for one run_year result."""
    p = result["params"]
    daily = result["daily"]
    sched = result["schedule"]
    kw = p["power_mw"] * 1000

    dates = pd.to_datetime(daily["date"])
    year_days = 366 if pd.Timestamp(year=p["year"], month=12, day=31).dayofyear == 366 else 365
    covered = (dates.max() - pd.Timestamp(year=p["year"], month=1, day=1)).days + 1
    annualized = covered < year_days
    scale = 365 / covered if annualized else 1.0

    total = float(daily["revenue"].sum())
    top10 = float(daily["revenue"].nlargest(10).sum())

    monthly = daily.groupby(dates.dt.month)["revenue"].sum() / kw

    # Hour x month mean net discharge MW (positive = discharging, negative = charging).
    local = pd.DatetimeIndex(sched["interval_start_local"])
    heat = sched.groupby([local.month, local.hour])["net_mw"].mean().unstack(fill_value=0.0)
    heat = heat.reindex(columns=range(24), fill_value=0.0)

    charged_mwh = sched["charge_mw"].sum()
    discharged_mwh = sched["discharge_mw"].sum()
    buy = (sched["price"] * sched["charge_mw"]).sum() / charged_mwh if charged_mwh else np.nan
    sell = (sched["price"] * sched["discharge_mw"]).sum() / discharged_mwh if discharged_mwh else np.nan

    return {
        "revenue_per_kw_year": round(total / kw * scale, 2),
        "revenue_per_kw_period": round(total / kw, 2),
        "annualized": bool(annualized),
        "days_covered": int(covered),
        "total_revenue": round(total, 0),
        "top10_day_share": round(top10 / total, 4) if total > 0 else None,
        "top10_days": daily.nlargest(10, "revenue")["date"].tolist(),
        "cycles_per_year": round(float(daily["cycles"].sum()) * scale, 1),
        "avg_charge_price": round(float(buy), 2),
        "avg_discharge_price": round(float(sell), 2),
        "avg_spread_captured": round(float(sell - buy), 2),
        "milp_days": int(daily["used_milp"].sum()),
        "monthly_revenue_per_kw": {int(m): round(float(v), 3) for m, v in monthly.items()},
        "heatmap_net_mw": {
            "months": [int(m) for m in heat.index],
            "hours": list(range(24)),
            "values": np.round(heat.to_numpy(), 1).tolist(),
        },
    }
