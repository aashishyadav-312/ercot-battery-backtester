"""Produce a separate reproducible strategy file; existing energy-only JSON is untouched.

python -m scripts.run_ancillary --env-file .env
Monthly/raw prices and per-configuration results are checkpointed in data/raw/.
"""
from __future__ import annotations
import argparse
import json
import os
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import numpy as np
import pandas as pd
from data.fetch_prices import fetch, RAW_DIR, _download_api, _fill_gaps
from data.fetch_ancillary import fetch_as
from data.fetch_all_nodes import quiet_gridstatus
from model.ancillary import optimize_stack, PRODUCTS, RTC_DATE, PRE_DURATIONS, POST_DURATIONS
from model.dispatch import optimize_day
from model.run_year import _expected_intervals

COMPONENTS = ('energy', *PRODUCTS)


def select_best_feasible(doc):
    """A known feasible energy-only schedule must dominate a worse AS incumbent.

    Retain the original dual bound when updating the reported relative gap.
    This is candidate selection, not calibration to a revenue benchmark.
    """
    for day in doc['daily']:
        value = sum(day[k] for k in COMPONENTS)
        baseline = day['energy_only']
        if value < baseline - 1e-6:
            gap = day.get('solver_gap')
            # Six daily components are rounded to 1e-6 $/kW each. Include
            # their error envelope, especially when the primal rounds to zero.
            upper = value + abs(value)*gap + 3e-6*(1+gap) if gap is not None else None
            day.update({k:baseline if k == 'energy' else 0. for k in COMPONENTS})
            day['solver_gap'] = max(0., (upper-baseline)/abs(baseline)) if upper is not None and baseline > 0 else None
            day['energy_fallback'] = True
        day.setdefault('solver_time_limit_s', 10.)
    return doc


def save_checkpoint(path, payload):
    """Replace a checkpoint when Windows permits it; a locked cache must not abort a solve.

    Antivirus/indexing readers can transiently deny delete/rename sharing. Keep
    the previous valid checkpoint if retries fail; the next day retries with a
    newer complete payload. Final run files are still written by compute_row.
    """
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(payload, separators=(',',':')))
    for attempt in range(6):
        try:
            temp.replace(path)
            return
        except PermissionError:
            time.sleep(.02 * (attempt + 1))


def fetch_energy(location, year, refresh=False):
    """Use one as-posted API source for the new screen, including hubs.

    Keep these hub caches separate from the corrected annual archive caches.
    Node caches already come from this same API and can be reused.
    """
    if not location.startswith('HB_'):
        return fetch(location, year, 'RT15', refresh=refresh)
    path = RAW_DIR / f'ANC_ENERGY_{location}_{year}.parquet'
    if refresh or not path.exists():
        df = _download_api(location, year, 'RT15')
        if df.empty:
            raise ValueError(f'No API energy prices for {location} {year}')
        _fill_gaps(df, 'RT15', year).to_parquet(path, index=False)
    return pd.read_parquet(path)


def run_stack(energy, da_as, rt_as, params, max_as_share=1.0, checkpoint=None, mip_time_limit_s=2.):
    """Skip incomplete days; compare energy-only and stacked on identical prices/days."""
    p = params
    data = energy[['interval_start_utc', 'interval_start_local', 'price']].copy().reset_index(drop=True)
    data['hour'] = data.interval_start_utc.dt.floor('h')
    da = data.merge(da_as.rename(columns={'interval_start_utc':'hour'}), on='hour', how='left')
    if rt_as is not None:
        rt = data.merge(rt_as, on='interval_start_utc', how='left')
        post = data.interval_start_local.dt.strftime('%Y-%m-%d') >= RTC_DATE
        da.loc[post, list(PRODUCTS)] = rt.loc[post, list(PRODUCTS)].to_numpy()
    else:
        da.loc[data.interval_start_local.dt.strftime('%Y-%m-%d') >= RTC_DATE, list(PRODUCTS)] = np.nan
    saved = json.loads(checkpoint.read_text()) if checkpoint and checkpoint.exists() else {}
    rows, skipped = saved.get('daily', []), saved.get('skipped_days', [])
    done = {r['date'] for r in rows} | set(skipped)
    unmeasured = saved.get('resumed_days_unmeasured', len(rows) if 'runtime_s' not in saved else 0)
    prior_runtime = saved.get('runtime_s', 0.)
    started = time.perf_counter()
    for day, g in da.groupby(da.interval_start_local.dt.strftime('%Y-%m-%d'), sort=True):
        if day in done:
            continue
        if len(g) != _expected_intervals(pd.Timestamp(day), .25) or not np.isfinite(g[['price', *PRODUCTS]].to_numpy(dtype=float)).all():
            skipped.append(day)
            continue
        post = day >= RTC_DATE
        durations = POST_DURATIONS if post else PRE_DURATIONS
        result = optimize_stack(g.price.to_numpy(), g[list(PRODUCTS)].to_numpy(), .25,
                                p['power_mw'], p['power_mw']*p['duration_h'], p['rte'],
                                p['deg_cost_per_mwh'], durations=durations,
                                award_groups=None if post else g.hour.tolist(), max_as_share=max_as_share,
                                mip_time_limit_s=mip_time_limit_s)
        baseline = optimize_day(g.price.to_numpy(), .25, p['power_mw'], p['power_mw']*p['duration_h'],
                                p['rte'], p['deg_cost_per_mwh'], 0.)
        rows.append({'date':day, **{k:round(v / (p['power_mw']*1000), 6) for k,v in result['components'].items()},
                     'energy_only':round(baseline['revenue']/(p['power_mw']*1000), 6),
                     'market':'RT' if post else 'DA', 'milp':result['used_milp'], 'solver_gap':result['solver_gap'],
                     'solver_time_limit_s':result['solver_time_limit_s']})
        if checkpoint:
            save_checkpoint(checkpoint, {'daily':rows, 'skipped_days':skipped,
                            'runtime_s':prior_runtime + time.perf_counter()-started,
                            'resumed_days_unmeasured':unmeasured})
    return {'params': p, 'daily':rows, 'skipped_days':skipped,
            'runtime_s':round(prior_runtime + time.perf_counter()-started, 2),
            'resumed_days_unmeasured':unmeasured, 'max_as_share':max_as_share, 'solver_target_gap':.001}


def compute_row(row):
    quiet_gridstatus()
    share = row.get('_max_as_share', 1.)
    prefix = '' if share == 1 else f'share_{share:g}_'
    checkpoint = RAW_DIR / ('STACK_' + prefix + row['file'])
    if checkpoint.exists():
        doc = json.loads(checkpoint.read_text())
        for day in doc['daily']:
            day.setdefault('solver_time_limit_s', 10.)  # early cached runs
        return row['file'], select_best_feasible(doc)
    energy = fetch_energy(row['location'], row['year'])  # prefetched by parent
    energy = energy[energy.interval_start_local.dt.strftime('%Y-%m-%d') <= row['last_day']]
    p = {k:row[k] for k in ('location','year','duration_h','rte','deg_cost_per_mwh')}
    p['power_mw'] = 100.
    doc = run_stack(energy, fetch_as(row['year'], 'DA'),
                    fetch_as(row['year'], 'RT') if row['year'] >= 2025 else None, p,
                    max_as_share=share, checkpoint=RAW_DIR / ('PARTIAL_' + prefix + row['file']),
                    mip_time_limit_s=row.get('_mip_time_limit_s',2.))
    for day in doc['daily']:
        day.setdefault('solver_time_limit_s', 10.)
    if not doc['daily']:
        raise ValueError('No complete energy/AS days for ' + row['file'])
    doc = select_best_feasible(doc)
    checkpoint.write_text(json.dumps(doc, separators=(',',':')))
    return row['file'], doc


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path)
    parser.add_argument('--locations', nargs='+')
    parser.add_argument('--years', nargs='+', type=int, default=[2024,2025,2026])
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--durations', nargs='+', type=float)
    parser.add_argument('--degs', nargs='+', type=float)
    parser.add_argument('--max-as-share', type=float, default=1.)
    parser.add_argument('--mip-time-limit', type=float, default=2.)
    args = parser.parse_args()
    if args.env_file:
        for line in args.env_file.read_text(encoding='utf-8-sig').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                k,v = line.split('=',1); os.environ[k.strip()] = v.strip().strip('"').strip("'")
    quiet_gridstatus()
    RAW_DIR.mkdir(exist_ok=True)
    index = json.loads(Path('results/index.json').read_text())['runs']
    rows = [r for r in index if r['year'] in args.years and (not args.locations or r['location'] in args.locations)]
    rows = [dict(r, _max_as_share=args.max_as_share, _mip_time_limit_s=args.mip_time_limit) for r in rows
            if (not args.durations or r['duration_h'] in args.durations)
            and (not args.degs or r['deg_cost_per_mwh'] in args.degs)]
    if not 0 <= args.max_as_share <= 1:
        parser.error('--max-as-share must be between 0 and 1')
    if not np.isfinite(args.mip_time_limit) or args.mip_time_limit <= 0:
        parser.error('--mip-time-limit must be positive and finite')
    prefix = '' if args.max_as_share == 1 else f'share_{args.max_as_share:g}_'
    rows.sort(key=lambda r: (r['location'] != 'HB_HOUSTON', r['year'] != 2025,
                            r['duration_h'] != 2, r['deg_cost_per_mwh'] != 10))
    if not 1 <= args.workers <= 8:
        parser.error('--workers must be between 1 and 8')
    if args.refresh:
        for row in rows:
            for cache_prefix in ('STACK_', 'PARTIAL_'):
                (RAW_DIR / (cache_prefix + prefix + row['file'])).unlink(missing_ok=True)
    as_data = {}
    for year in sorted({r['year'] for r in rows}):
        print(f'Fetching AS {year}', flush=True)
        da = fetch_as(year, 'DA', refresh=args.refresh)
        rt = fetch_as(year, 'RT', refresh=args.refresh) if year >= 2025 else None
        as_data[year] = (da,rt)
    docs = {}
    outpath = Path(f'results/ancillary{("_share_" + format(args.max_as_share, "g")) if args.max_as_share != 1 else ""}.json')
    if outpath.exists():
        docs.update(json.loads(outpath.read_text())['runs'])
    # Accept an earlier monolithic artifact, but publish per-selection files.
    for filename, value in list(docs.items()):
        if isinstance(value, dict):
            detail = 'as_' + prefix + filename
            Path('results', detail).write_text(json.dumps(value, separators=(',',':'), allow_nan=False))
            docs[filename] = detail
    # Download sequentially so parallel solvers cannot multiply API request rates.
    executor = ProcessPoolExecutor(max_workers=args.workers)
    futures = []
    for location, year in dict.fromkeys((r['location'], r['year']) for r in rows):
        print('Caching energy', location, year, flush=True)
        fetch_energy(location, year, refresh=args.refresh)
        futures.extend(executor.submit(compute_row, r) for r in rows if (r['location'], r['year']) == (location, year))
    for future in as_completed(futures):
        filename, doc = future.result()
        detail = 'as_' + prefix + filename
        Path('results', detail).write_text(json.dumps(doc, separators=(',',':'), allow_nan=False))
        docs[filename] = detail
        payload = {'meta':{'rtc_date':RTC_DATE, 'units':'$/kW per operating day; energy net of degradation',
                   'max_as_share': args.max_as_share,
                   'solver_target_gap': .001,
                   'default_mip_time_limit_s':args.mip_time_limit,
                   'energy_prices':'ERCOT as-posted public API NP6-905-CD for both hubs and nodes; separate from the original corrected hub archives',
                   'prices_before':'DA hourly NP4-188-CD, awards held per UTC hour',
                   'prices_after':'RT 15-minute settlement MCPC NP6-796-ER; no DA awards or double-counting',
                   'durations_before_h':PRE_DURATIONS,'durations_after_h':POST_DURATIONS,
                   'limitations':['perfect foresight','no AS deployment energy/mileage/penalties',
                                  'qualification and liquidity ignored','conservative shared inverter and reserve backing',
                                  'pre-RTC regulation/RRS uses conservative full-hour backing'],
                   'sources':['https://www.ercot.com/mktrules/issues/NPRR1282',
                              'https://www.ercot.com/mp/data-products/data-product-details?id=NP6-796-ER']}, 'runs':docs}
        outpath.write_text(json.dumps(payload, separators=(',',':'), allow_nan=False))
        print(filename, len(doc['daily']), 'days', doc['runtime_s'], 's', flush=True)
    executor.shutdown()


if __name__ == '__main__':
    main()
