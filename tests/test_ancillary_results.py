"""Published artifacts must cover the existing grid and preserve accounting contracts."""
import json
import math
from pathlib import Path


def test_published_ancillary_grid_is_complete_finite_and_matches_selections():
    results = Path(__file__).resolve().parents[1] / 'results'
    index = json.loads((results/'index.json').read_text())['runs']
    manifest = json.loads((results/'ancillary.json').read_text())
    assert set(manifest['runs']) == {r['file'] for r in index}
    components = ('energy','REGUP','REGDN','RRS','ECRS','NSPIN')
    for row in index:
        detail = manifest['runs'][row['file']]
        assert detail == 'as_' + row['file']
        doc = json.loads((results/detail).read_text())
        assert doc['max_as_share'] == 1.
        for key in ('location','year','duration_h','rte','deg_cost_per_mwh'):
            assert doc['params'][key] == row[key]
        days = doc['daily']
        assert days
        dates = [d['date'] for d in days]
        assert dates == sorted(set(dates))
        assert not set(dates).intersection(doc['skipped_days'])
        for d in days:
            assert d['date'].startswith(str(row['year']))
            assert d['date'] <= row['last_day']
            assert d['market'] == ('DA' if d['date'] < '2025-12-05' else 'RT')
            assert all(math.isfinite(d[k]) for k in (*components,'energy_only'))
            assert sum(d[k] for k in components) >= d['energy_only'] - 1e-6
            assert d['solver_gap'] is None or (math.isfinite(d['solver_gap']) and d['solver_gap'] >= 0)
