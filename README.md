# MARKET RAIN v1.1 — Stock Data Is the Matrix Rain

**A Matrix-inspired stock research terminal for GitHub Pages.** Every falling character is sourced from a stock symbol, its latest cached price, or its daily percentage change. There is **no separate randomly generated Matrix-text background**, no boxed ticker cards, and no independent overlay; actual tracked stock data forms the rain itself. Green means the latest daily close was up on the prior session; red means it was down. A watchlist sits on the left, a blue research scanner on the right, and a keyboard-driven ticker console along the bottom.

## Launch on GitHub Pages — direct upload

1. Make a new **public** GitHub repository (for example `Market-Rain`), with `main` as the default branch.
2. **Unzip the download and upload the *contents* of the folder** to the repository root. Include the hidden `.github` folder, the `.nojekyll` file and all icons. The root should contain `index.html` — not a second nested folder.
3. Go to **Settings → Pages → Build and deployment → Deploy from a branch**. Choose branch `main` and folder `/(root)`, then Save.
4. Open `https://YOUR_USERNAME.github.io/Market-Rain/` (replace username/repo as required).
5. Initially the interface displays an **obviously labelled simulated demo**. No sample stock quotes or dividends are real.
6. To try real delayed daily market snapshots, go to **Actions → Update market snapshot → Run workflow**. For scheduled refreshes, enable Actions and ensure the workflow file is on the default `main` branch. After the run commits `data/quotes.json`, reload your site. Thereafter the workflow runs roughly every three hours, subject to GitHub scheduling and third-party service availability.

> **Important market-data / licensing note**: The optional update pipeline uses community-maintained `yfinance` to access Yahoo Finance. According to its own documentation, it is intended for **research and personal use** and is not an official licensed redistribution API. **Check Yahoo’s and any market exchange's data rights and usage terms before publicly distributing or commercialising its output.** For a public production site, swap the updater for a provider that licenses public display and any real-time data you need. No credentials are stored in the browser.

## What works

- Seven animated category lanes: Technology, Financials, Energy, Healthcare, Consumer, Industrials and New Zealand (NZX).
- **v1.1 data-driven Matrix streams:** each fine vertical stream represents a tracked stock, repeating its **ticker / price / daily percentage change** one character at a time. A bright leading glyph travels downward with a fading tail. Green streams correspond to rising shares, red to falling, and neutral to unchanged. The *animation* is artistic, but the character packets use the numbers from the downloaded snapshot.
- **Hover or tap a stream** to identify the stock and open its price chart, company details and dividends. A hover readout shows ticker, price and percentage. Keyboard and screen-reader users can reach a focused symbol list inside each sector lane, or use the command console.
- A persistent personal watchlist stored in the browser and a responsive mobile Watch / Rain / Radar navigation.
- A blue **RADAR** screening panel combining 52-week price-range position and a 14-period RSI. It is not a predictive model, buy rating or recommendation.
- Stock detail dialog: price, previous close, 52-week high/low, session volume, interactive 1M/3M/6M/1Y historical charts and most recent recorded dividends.
- Command console: `AAPL`, `Apple` (company name), `WATCH AAPL`, `UNWATCH AAPL`, `LIST`, `SCAN`, `TECH`, `NZX`, `PAUSE`, `RESUME`, `INSTALL`, `HELP`. Use `/` to focus, `?` for help, `Esc` to close.
- Settings for **stock stream density**, rain speed and pause. The site respects reduced-motion preferences; pausing freezes the data rain itself instead of replacing it with random static code.
- Progressive Web App (PWA) with a custom icon, HTTPS-based installation and an offline cache. The service worker is configured for subpaths on GitHub Pages.
- Fetch failures retain the previous **real** snapshot per ticker, clearly flagging it as stale; if all sources fail, the updater does not overwrite existing data.

## Phone installation (custom icon, standalone window)

**iPhone:** Visit your GitHub Pages website in Safari; tap **Share → Add to Home Screen**, turn on **Open as Web App** when shown, then tap Add. Newer iOS browsers may also offer this feature.

**Android:** In Chrome (on Google Play services devices) or Samsung Internet, open your site and use **Install app**. Supported PWA installations behave like installed apps, show the dedicated Market Rain icon and launch without browser address-bar chrome. Other browsers may only create a **browser-badged shortcut** — a website cannot force those browsers to give you a badge-free icon. If an actual APK or iOS App Store build is required, a separate app package/signing/distribution process is needed.

The PWA **works only on HTTPS or localhost**. GitHub Pages provides HTTPS. Opening `index.html` directly with `file://` will not load the JSON feed or register the service worker correctly.

## Stock configuration

The stock universe is editable in `config/stocks.json`. Every entry has a Yahoo-style `symbol` and a friendly `name`, nested under a category with an `id`, `label`, and `short`. Examples:

- US: `AAPL`, `MSFT`, `NVDA`, `BRK-B`
- New Zealand: `FPH.NZ`, `AIA.NZ`, `MEL.NZ`
- Australia: `BHP.AX`, `CBA.AX` (add to the JSON if desired)

After editing, **run the Update market snapshot action**. Tickers not in the JSON cannot be loaded on demand by the static command console. Your personal watchlist tracks only symbols supported by the configured market snapshot. The watchlist is stored locally on each device, not synced between devices.

## Data interpretation

The updater uses **daily unadjusted OHLC closes**, not a streaming live quote. The quoted percentage is the last available session close versus the prior session close. `LAST SESSION VOLUME` is not real-time. Historical charts cover up to one year; `52-WEEK` low/high are based on available intraday daily lows/highs in that window. Cash dividends are historical records for that window. Yield is a simple historical dividends / latest close quotient, not a forward dividend forecast. Exchange coverage, symbol naming, currency units, data quality, timestamps and provider accessibility may vary.

**RADAR** uses a stock's position in its 52-week high-low range and its most recent 14 day RSI. Qualifying when price is ≤40% of that range or RSI ≤40, its displayed score ranks only the *configured tracked universe*. No fundamental valuation, risk, liquidity, taxes or future returns are assessed. No score should be interpreted as a 'good buy'.

## Project structure

```text
index.html                 Single-page frontend
styles.css                 Responsive Matrix interface and stream hover
app.js                     Single-layer stock-data rain, terminal, scanner, charts, settings
manifest.webmanifest       Installable standalone PWA manifest
sw.js                      Offline caching / refresh
icons/                     Favicon, Apple, Android & maskable icons
config/stocks.json         Sectors + stock universe
data/quotes.json           Starts explicitly simulated; updater replaces it
scripts/update_quotes.py   Yahoo/yfinance market snapshot importer
scripts/requirements.txt   GitHub Actions Python dependency
scripts/make_demo.py       Regenerate clearly simulated preview data
scripts/make_icons.py      Regenerate icon files (optional, Pillow)
.github/workflows/update-market.yml  Scheduled/manual stock refresh
.nojekyll                  Ensure GitHub Pages serves raw files
```

For local web testing (not necessary when deploying), run `python -m http.server 8000` in the unzipped folder and open `http://localhost:8000/`.

## Scope and known limitations (v1.0)

- The optional market feed is **not a licensed real-time feed**. GitHub Actions refreshes the cached data on a schedule, and third-party fetches can fail or be delayed.
- The falling glyphs are sourced from each stock’s ticker, snapshot price and percentage move. Their **motion** does not represent individual transactions or price ticks; values change only when the downloaded snapshot changes.
- The console searches a curated universe; arbitrary new symbols need `config/stocks.json` edits and a data refresh.
- Pricing and dividends are in the source ticker's listing currency and are not converted into NZD.
- No brokerage connection, placing trades, user account, cross-device sync, or alerts in v1.0.
- Long-running public redistribution should use an appropriately licensed provider.

*Educational/research visualization; not investment advice.*

### Troubleshooting market updates

- If **Actions → Update market snapshot** is missing, verify that `.github/workflows/update-market.yml` was uploaded, including the leading dot on `.github`, and that Actions are enabled.
- If the workflow finishes with a **403 / permission denied** while committing, check **Settings → Actions → General → Workflow permissions** and allow workflow write permissions (where your repository policy permits it). The YAML requests `contents: write`.
- If the workflow says **Every source request failed**, the third-party provider was unavailable or blocked. Your existing usable `data/quotes.json` stays intact. Retry manually or switch to a supported/licensed feed.
- A successful GitHub Action that has committed a snapshot might still take a short period to appear on GitHub Pages due to site deployment and browser caching. Reload or reopen the PWA to fetch the updated snapshot.


## What changed in v1.1

In v1.0, independent floating stock cards moved in front of random green/red Matrix background glyphs. That made the code rain effectively a wallpaper.

**v1.1 removes both visual layers and replaces them with a single stock-code renderer.** Each stock is assigned a thin vertical stream. Its ticker, cached price and percentage movement loop through that stream as falling characters, with a bright leading head and dimmer tail. Color encodes daily direction; the stream's movement is decorative. Tap/click a character stream to open the stock’s normal detail dialog, or use the bottom command console.

For best results, choose **MEDIUM** density on desktop or **HIGH** for a denser, more cinematic rain. On phones, swipe horizontally across sector columns. All existing backend updater, watchlist, radar, charts, dividend records and PWA functionality remain unchanged.
