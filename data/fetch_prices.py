"""Download ERCOT settlement point prices with gridstatus and cache them as parquet.

Phase 1 implements fetch(location, year, market) for market in {"RT15", "DA"},
writing data/raw/{market}_{location}_{year}.parquet.
"""
