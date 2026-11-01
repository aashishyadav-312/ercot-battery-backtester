"""Normalize published AS detail files and record publication metadata.

python -m scripts.finalize_ancillary [--summary path.json]

Early batch workers wrote detail files before select_best_feasible existed.
Pass every base and sensitivity file through it (idempotent), rewrite with
allow_nan=False, and stamp software versions on each manifest.
"""
from __future__ import annotations
import argparse
import datetime
import importlib.metadata
import json
import statistics
import sys
from pathlib import Path
from scripts.run_ancillary import COMPONENTS, select_best_feasible

RESULTS = Path('results')
MANIFESTS = ('ancillary.json', 'ancillary_share_0.5.json')


def dump(path, doc):
    path.write_text(json.dumps(doc, separators=(',',':'), allow_nan=False))


def numerical_width(run):
    """Full-period $/kW range implied by daily relative gaps, or None if any bound is unknown."""
    if any(d['solver_gap'] is None for d in run['daily']):
        return None
    return sum(abs(sum(d[k] for k in COMPONENTS))*d['solver_gap'] + 3e-6*(1+d['solver_gap']) for d in run['daily'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--summary', type=Path, help='also write the summary JSON here')
    args = parser.parse_args()
    index = json.loads((RESULTS/'index.json').read_text())['runs']
    base = json.loads((RESULTS/'ancillary.json').read_text())
    if set(base['runs']) != {r['file'] for r in index}:
        sys.exit('AS grid is incomplete; run scripts.run_ancillary first')
    software = {n:importlib.metadata.version(n) for n in ('gridstatus','pulp','highspy','pandas','numpy')}
    software['python'] = sys.version.split()[0]
    published = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    runs, changed = {}, 0
    for name in MANIFESTS:
        mpath = RESULTS/name
        manifest = json.loads(mpath.read_text())
        for key, detail in manifest['runs'].items():
            path = RESULTS/detail
            before = json.loads(path.read_text())
            doc = select_best_feasible(json.loads(path.read_text()))
            changed += doc != before
            dump(path, doc)
            if name == 'ancillary.json':
                runs[key] = doc
        manifest['meta'].update(software=software, published_at_utc=published,
            numerics='Feasible incumbents; achieved relative gaps and per-solve MIP time budgets recorded per day. '
                     'Early cached results use longer or stricter settings. Known energy-only candidate selected if better.')
        dump(mpath, manifest)
    days = [d for r in runs.values() for d in r['daily']]
    gaps = [d['solver_gap'] for d in days if d['solver_gap'] is not None]
    sizes = [(RESULTS/f).stat().st_size for f in base['runs'].values()]
    widths = [(w, k) for k, r in runs.items() if (w := numerical_width(r)) is not None]
    summary = {'configurations':len(runs), 'detail_files_changed':changed, 'days':len(days),
               'skipped_days':sum(len(r['skipped_days']) for r in runs.values()),
               'fallback_days':sum(bool(d.get('energy_fallback')) for d in days),
               'above_target':sum(g > .001 + 1e-8 for g in gaps),
               'unknown_bounds':sum(d['solver_gap'] is None for d in days),
               'max_relative_gap':max(gaps, default=0),
               'widest_numerical_range':max(widths, default=(0, None)),
               'sum_configuration_wall_s':round(sum(r['runtime_s'] for r in runs.values()), 1),
               'median_configuration_wall_s':statistics.median(r['runtime_s'] for r in runs.values()),
               'unmeasured_resumed_days':sum(r.get('resumed_days_unmeasured', 0) for r in runs.values()),
               'detail_bytes':sum(sizes), 'max_detail_bytes':max(sizes),
               'median_detail_bytes':statistics.median(sizes), 'software':software}
    text = json.dumps(summary, indent=2)
    if args.summary:
        args.summary.write_text(text)
    print(text)


if __name__ == '__main__':
    main()
