"""Single-day battery dispatch LP (PuLP + HiGHS).

Phase 2 implements optimize_day(prices, dt_hours, power_mw, energy_mwh, rte,
deg_cost_per_mwh, soc0_frac), returning the schedule and revenue for one day.
"""
