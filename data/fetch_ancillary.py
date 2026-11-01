"""Cached ERCOT AS prices via open-source gridstatus; never substitute DA for RT.

DA: NP4-188-CD, hourly capacity clearing prices, get_as_prices.
RT: NP6-796-ER annual 15-min settlement MCPC workbook, parsed by Ercot.parse_doc.
The weekly archive is lagged. Missing coverage remains missing, never zero-filled.
"""
from __future__ import annotations
import io
import zipfile
import pandas as pd
import requests
from gridstatus import Ercot
from data.fetch_prices import RAW_DIR, _api_client, _throttle
from model.ancillary import PRODUCTS, RTC_DATE

DA_COLUMNS = dict(zip(PRODUCTS, ('Regulation Up', 'Regulation Down', 'Responsive Reserves',
                               'ERCOT Contingency Reserve Service', 'Non-Spinning Reserves')))


def normalize_as(frame, market):
    """Normalize parsed gridstatus tables to unique UTC intervals, rejecting conflicts."""
    if market == 'DA':
        out = frame[['Interval Start', *DA_COLUMNS.values()]].rename(columns={v:k for k,v in DA_COLUMNS.items()})
        out = out.rename(columns={'Interval Start':'interval_start_utc'})
    elif market == 'RT':
        f = frame[frame['AS Type'].isin(PRODUCTS)].copy()
        # pivot deliberately rejects duplicate products: no silent price averaging.
        out = f.pivot(index='Interval Start', columns='AS Type', values='MCPC').reset_index()
        out = out.rename(columns={'Interval Start':'interval_start_utc'})
    else:
        raise ValueError('AS market must be DA or RT')
    out['interval_start_utc'] = pd.to_datetime(out['interval_start_utc'], utc=True)
    out = out[['interval_start_utc', *PRODUCTS]].sort_values('interval_start_utc')
    for k in PRODUCTS:
        out[k] = pd.to_numeric(out[k], errors='raise')
    if out['interval_start_utc'].duplicated().any() or out[list(PRODUCTS)].isna().any().any():
        raise ValueError('Duplicate or missing AS prices')
    return out.reset_index(drop=True)


def parse_rt_workbook(blob):
    """ERCOT workbook has a report-info sheet and month sheets with header on row 9."""
    x = pd.ExcelFile(io.BytesIO(blob))
    frames = [pd.read_excel(x, sheet_name=s, header=8) for s in x.sheet_names if s != 'Report Info']
    raw = pd.concat(frames, ignore_index=True).dropna(subset=['Delivery Date'])
    raw = raw.rename(columns={'Delivery Date':'DeliveryDate', 'Delivery Hour':'DeliveryHour',
                            'Delivery Interval':'DeliveryInterval', 'Repeated Hour Flag':'DSTFlag'})
    raw['DeliveryDate'] = pd.to_datetime(raw['DeliveryDate']).dt.strftime('%m/%d/%Y')
    parsed = Ercot().parse_doc(raw)
    return normalize_as(parsed, 'RT')


def fetch_as(year, market, api=None, refresh=False):
    RAW_DIR.mkdir(exist_ok=True)
    path = RAW_DIR / f'ANCILLARY_{market}_{year}.parquet'
    if path.exists() and not refresh:
        return pd.read_parquet(path)
    api = api or _api_client()
    if market == 'DA':
        end = min(pd.Timestamp(f'{year+1}-01-01', tz='US/Central'),
                  pd.Timestamp.now(tz='US/Central').normalize())
        _throttle()
        # API bulk archive fetch, one daily document per operating day.
        frame = api.get_as_prices(f'{year}-01-01', end=end)
        out = normalize_as(frame, 'DA')
    elif market == 'RT':
        if year < 2025:
            raise ValueError('RT AS prices do not exist before RTC+B')
        # The public annual archive keeps completed years available too.
        ercot = Ercot()
        _throttle()
        doc = ercot._get_document(report_type_id=25570, constructed_name_contains=f'MCPC_{year}.')
        response = requests.get(doc.url, timeout=(10, 120))
        response.raise_for_status()
        blob = response.content
        # Some MIS links wrap a workbook in a ZIP; XLSX itself is also a ZIP.
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            workbooks = [n for n in z.namelist() if n.lower().endswith('.xlsx')]
            if workbooks:
                blob = z.read(workbooks[0])
        out = parse_rt_workbook(blob)
        out = out[out.interval_start_utc >= pd.Timestamp(RTC_DATE, tz='US/Central').tz_convert('UTC')]
    else:
        raise ValueError('AS market must be DA or RT')
    if out.empty:
        raise ValueError(f'No {market} ancillary prices for {year}')
    out.to_parquet(path, index=False)
    return out
