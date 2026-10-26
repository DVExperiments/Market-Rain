#!/usr/bin/env python3
"""Build a delayed daily-close snapshot for Market Rain.

Fetches only the configured symbols; the browser never holds credentials.
The Yahoo/yfinance source is unofficial and intended for research/personal use.
Check source licences and terms before distributing market data publicly.
"""
import json
import logging
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'config' / 'stocks.json'
OUTPUT = ROOT / 'data' / 'quotes.json'

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')


def numeric(value):
    try:
        value = float(value)
        return round(value, 6) if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def currency_for(symbol):
    if symbol.endswith('.NZ'):
        return 'NZD'
    if symbol.endswith('.AX'):
        return 'AUD'
    if symbol.endswith('.L'):
        return 'GBP'
    if symbol.endswith('.TO'):
        return 'CAD'
    return 'USD'


def download_one(symbol):
    """One symbol, one year of DAILY unadjusted closing prices and cash dividends."""
    ticker = yf.Ticker(symbol)
    daily = ticker.history(period='1y', interval='1d', auto_adjust=False, actions=True, raise_errors=True)
    if daily is None or daily.empty:
        raise RuntimeError('No daily price history returned')
    history = []
    dividends = []
    volumes = []
    for dt, row in daily.iterrows():
        date = dt.date().isoformat()
        close = numeric(row.get('Close'))
        if close is not None and close > 0:
            history.append([date, round(close, 4)])
            volumes.append(int(numeric(row.get('Volume')) or 0))
        dividend = numeric(row.get('Dividends'))
        if dividend and dividend > 0:
            dividends.append([date, dividend])
    if len(history) < 2:
        raise RuntimeError('Fewer than two usable closing prices')
    prices = [row[1] for row in history]
    current, previous = prices[-1], prices[-2]
    high = numeric(daily['High'].max()) if 'High' in daily else max(prices)
    low = numeric(daily['Low'].min()) if 'Low' in daily else min(prices)
    daily_change = (current / previous - 1) * 100 if previous else 0
    return {
        'symbol': symbol,
        'price': current,
        'previous_close': previous,
        'change_abs': round(current - previous, 4),
        'change_pct': round(daily_change, 4),
        'currency': currency_for(symbol),
        'high_52w': round(high, 4) if high else None,
        'low_52w': round(low, 4) if low else None,
        'volume': volumes[-1] if volumes else None,
        'asof': history[-1][0],
        'stale': False,
        'history': history,
        'dividends': dividends,
    }


def main():
    config = json.loads(CONFIG.read_text(encoding='utf-8'))
    symbols = list(dict.fromkeys(
        item['symbol'].upper() for category in config['categories'] for item in category['tickers']
    ))
    old = {}
    try:
        existing = json.loads(OUTPUT.read_text(encoding='utf-8'))
        if existing.get('mode') == 'market_snapshot':
            old = existing.get('stocks') or {}
    except (FileNotFoundError, ValueError):
        pass
    successes, failed, carried = 0, [], 0
    result = {}
    for idx, symbol in enumerate(symbols, 1):
        logging.info('[%s/%s] %s', idx, len(symbols), symbol)
        for attempt in range(2):
            try:
                result[symbol] = download_one(symbol)
                successes += 1
                break
            except Exception as exc:  # source is an external third-party feed
                logging.warning('%s attempt %s: %s', symbol, attempt + 1, str(exc)[:180])
                if attempt == 0:
                    time.sleep(2)
        else:
            failed.append(symbol)
            if symbol in old:
                result[symbol] = dict(old[symbol], stale=True)
                carried += 1
        time.sleep(0.3)

    # Do not replace an earlier usable snapshot with an all-failed fetch.
    if successes == 0:
        logging.error('Every source request failed. Existing data remains intact.')
        return 1
    data = {
        'version': '1.0.0',
        'mode': 'market_snapshot',
        'source': 'Yahoo Finance via yfinance (unofficial; personal/research use)',
        'price_basis': 'Unadjusted daily closes; daily percentage change vs previous session close',
        'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'requested': len(symbols),
        'successful': successes,
        'carried_forward': carried,
        'unavailable': [s for s in failed if s not in result],
        'stocks': result,
    }
    temp = OUTPUT.with_suffix('.json.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    os.replace(temp, OUTPUT)
    logging.info('Snapshot generated: %s fresh / %s retained / %s unavailable', successes, carried, len(data['unavailable']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
