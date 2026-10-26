#!/usr/bin/env python3
"""Create a CLEARLY SIMULATED market snapshot for the first GitHub Pages deploy."""
import json
import hashlib
import math
import random
from datetime import date, timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
cfg=json.loads((ROOT/'config/stocks.json').read_text())
stocks={}
# A seeded visual demo: these are NOT historical or current market prices.
last=date.today()
if last.weekday()>=5:last-=timedelta(days=last.weekday()-4)
days=[]
while len(days)<251:
    if last.weekday()<5:days.append(last)
    last-=timedelta(days=1)
days.reverse()
for cat in cfg['categories']:
    for item in cat['tickers']:
        ticker=item['symbol']
        seed=int(hashlib.sha256(ticker.encode()).hexdigest()[:12],16)
        rng=random.Random(seed)
        start=(3+rng.random()*29) if ticker.endswith('.NZ') else (24+rng.random()*260)
        downbias=ticker in {'PFE','TSLA','SPK.NZ','BP','UPS','AIR.NZ','AMD'}
        drift=-.0015 if downbias else .00045
        p=start
        history=[]
        for day in days:
            p=max(.5,p*(1+drift+rng.gauss(0,.012)))
            history.append([day.isoformat(),round(p,4)])
        price,previous=history[-1][1],history[-2][1]
        vals=[v for _,v in history]
        dividends=[]
        if ticker not in {'NVDA','TSLA','AMZN','GOOGL','AMD'}:
            for i in (64,128,192,248):
                dividends.append([days[i].isoformat(),round(.04+rng.random()*.48,3)])
        stocks[ticker]={
            'symbol':ticker,'price':price,'previous_close':previous,
            'change_abs':round(price-previous,4),'change_pct':round((price/previous-1)*100,4),
            'currency':'NZD' if ticker.endswith('.NZ') else 'USD',
            'high_52w':round(max(vals)*1.004,4),'low_52w':round(min(vals)*.996,4),
            'volume':rng.randrange(125000,13500000),'asof':history[-1][0],
            'stale':False,'history':history,'dividends':dividends}
result={
    'version':'1.0.0','mode':'demo','source':'SIMULATED placeholder — not real market data',
    'price_basis':'Synthetic daily closes for UI preview. No real prices or dividends.',
    'generated_at':None,'requested':len(stocks),'successful':0,'carried_forward':0,'unavailable':[],
    'stocks':stocks
}
(ROOT/'data/quotes.json').write_text(json.dumps(result,separators=(',',':'))+'\n',encoding='utf-8')
print(f'Wrote {len(stocks)} explicitly synthetic symbols')
