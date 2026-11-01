"""Audit and print the committed Phase 14 grid, coverage, gaps and benchmark comparisons."""
import json
import math
from pathlib import Path


def main():
    doc = json.loads(Path('results/ancillary.json').read_text())
    runs = {k:json.loads(Path('results',v).read_text()) if isinstance(v,str) else v for k,v in doc['runs'].items()}
    print('Configurations:', len(runs))
    print('Configuration wall seconds (sum, includes checkpoint I/O; processes run concurrently):', round(sum(r['runtime_s'] for r in runs.values()), 1))
    print('Early resumed days with unmeasured wall time:',sum(r.get('resumed_days_unmeasured',0) for r in runs.values()))
    gaps = [d['solver_gap'] for r in runs.values() for d in r['daily'] if d.get('solver_gap') is not None]
    print('Maximum recorded solver gap:', max(gaps, default=0))
    print('Days above 0.1% target gap:', sum(g > 1e-3 + 1e-8 for g in gaps))
    print('Days with unknown solver upper bounds:',sum(d.get('solver_gap') is None for r in runs.values() for d in r['daily']))
    print('Known energy-only candidates selected:',sum(bool(d.get('energy_fallback')) for r in runs.values() for d in r['daily']))
    print('Total missing days:', sum(len(r['skipped_days']) for r in runs.values()))
    print('location | year | covered days | energy only | energy in stack | AS | total ($/kW period)')
    for r in runs.values():
        p, days = r['params'], r['daily']
        if p['duration_h'] == 2 and p['deg_cost_per_mwh'] == 10:
            energy = sum(d['energy'] for d in days)
            cap = sum(sum(d[k] for k in ('REGUP','REGDN','RRS','ECRS','NSPIN')) for d in days)
            base = sum(d['energy_only'] for d in days)
            print(f"{p['location']} | {p['year']} | {len(days)} | {base:.2f} | {energy:.2f} | {cap:.2f} | {energy+cap:.2f}")
    # This audit fails if any published number is non-finite or from an empty run.
    for name, r in runs.items():
        assert r['daily'], name
        dates = [d['date'] for d in r['daily']]
        assert dates == sorted(set(dates)), name
        for d in r['daily']:
            assert d['market'] == ('RT' if d['date'] >= '2025-12-05' else 'DA'), name
            values = [d[k] for k in ('energy','REGUP','REGDN','RRS','ECRS','NSPIN','energy_only')]
            assert all(math.isfinite(v) for v in values), name
            assert sum(values[:-1]) >= d['energy_only'] - 1e-6, (name,d['date'],'inferior incumbent')
            assert d['date'] not in r['skipped_days'], name
    # Every manifest entry must describe its own file, for the base grid and the sensitivity.
    index = {r['file']:r for r in json.loads(Path('results/index.json').read_text())['runs']}
    for manifest in ('ancillary.json', 'ancillary_share_0.5.json'):
        m = json.loads(Path('results', manifest).read_text())
        for key, detail in m['runs'].items():
            r = json.loads(Path('results', detail).read_text())
            assert r['max_as_share'] == m['meta']['max_as_share'], detail
            for k in ('location','year','duration_h','rte','deg_cost_per_mwh'):
                assert r['params'][k] == index[key][k], (detail, k)
            assert all(d['date'] <= index[key]['last_day'] for d in r['daily']), detail
    print('Manifest entries match location/year/duration/degradation: OK')
    print('Coverage (first..last covered day) and excluded days, configurations with exclusions:')
    for name, r in sorted(runs.items()):
        if r['skipped_days']:
            print(f"  {name}: {r['daily'][0]['date']}..{r['daily'][-1]['date']}, {len(r['daily'])} days, "
                  f"{len(r['skipped_days'])} excluded ({r['skipped_days'][0]}..{r['skipped_days'][-1]})")
    print('Artifact KiB:', round(Path('results/ancillary.json').stat().st_size/1024, 1))
    files = [Path('results', v) for v in doc['runs'].values() if isinstance(v,str)]
    print('Detail files MiB / largest KiB:',round(sum(p.stat().st_size for p in files)/1024**2,2),
          round(max((p.stat().st_size for p in files),default=0)/1024,1))
    uncertain = []
    for name,r in runs.items():
        if all(d.get('solver_gap') is not None for d in r['daily']):
            width = sum(abs(sum(d[k] for k in ('energy','REGUP','REGDN','RRS','ECRS','NSPIN')))*d['solver_gap']
                        + 3e-6*(1+d['solver_gap']) for d in r['daily'])
            uncertain.append((width,name))
    print('Largest known numerical range widths ($/kW period):',sorted(uncertain,reverse=True)[:5])


if __name__ == '__main__':
    main()
