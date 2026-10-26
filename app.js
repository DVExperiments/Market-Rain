/* MARKET RAIN v1.0 — no dependencies, static hosting, offline-capable PWA */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SYMBOL = /^[A-Z0-9^][A-Z0-9.\-^=]{0,19}$/;
  const STORE_KEY = 'market-rain-v1';
  const DEFAULT_WATCH = ['AAPL', 'NVDA', 'MSFT', 'FPH.NZ', 'TSLA'];
  const PALETTE = {up:'#2fff99',down:'#ff526b',flat:'#b2bfa3'};
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let cfg = null, feed = null, catalog = new Map(), raf = null, canvases = [], tickerSpecs = [];
  let deferredInstall = null, chartRange = '3M', selectedTicker = null;
  let rainLast = 0, activeOverlay = null;
  const readStorage = () => {try{return JSON.parse(localStorage.getItem(STORE_KEY))||{};}catch{return {};}};
  const initial = readStorage();
  const state = {
    watch: Array.isArray(initial.watch) ? initial.watch.filter(x => typeof x === 'string' && SYMBOL.test(x)).slice(0,35) : DEFAULT_WATCH,
    paused: !!initial.paused || reduceMotion.matches,
    density: ['low','medium','high'].includes(initial.density) ? initial.density : 'medium',
    speed: ['slow','normal','fast'].includes(initial.speed) ? initial.speed : 'normal',
    tab: 'rain'
  };
  const save = () => {try{localStorage.setItem(STORE_KEY, JSON.stringify({watch:state.watch,paused:state.paused,density:state.density,speed:state.speed}));}catch{}};
  const safe = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validNum = x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x));
  const num = (x,places=2) => validNum(x) ? Number(x).toLocaleString('en-NZ',{minimumFractionDigits:places,maximumFractionDigits:places}) : '—';
  const rawNum = x => validNum(x) ? Number(x) : null;
  const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));
  const pct = x => validNum(x) ? `${Number(x)>0?'+':''}${num(x,2)}%` : '—';
  const movement = x => x == null || !validNum(x) ? 'flat' : Number(x)>0.00001?'up':Number(x)<-0.00001?'down':'flat';
  const fmtPrice = item => item && validNum(item.price) ? `${num(item.price,2)} ${safe(item.currency || '')}` : '—';
  const dayString = dt => {if(!dt)return 'UNKNOWN';const d=new Date(dt);return Number.isNaN(d.getTime())?'UNKNOWN':d.toLocaleDateString('en-NZ',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).toUpperCase();};
  const whenString = dt => {if(!dt)return 'NOT YET UPDATED'; const d=new Date(dt);return Number.isNaN(d.getTime())?'UNKNOWN':d.toLocaleString('en-NZ',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Pacific/Auckland',hour12:false})+' NZT';};
  const getStock = ticker => feed?.stocks?.[ticker] || null;
  const getName = ticker => catalog.get(ticker)?.name || ticker;
  const getCategory = ticker => catalog.get(ticker)?.category?.label || 'UNCLASSIFIED';
  const getCategoryTickers = category => category.tickers.map(row => row.symbol).filter(s=>getStock(s));
  const setFeedback = (message,type='normal') => {const elem=$('terminalFeedback');elem.textContent=message;elem.style.color=type==='error'?'#ff8090':type==='success'?'#2fff99':'#80a592';};

  async function loadData(initialLoad=false){
    try{
      if(!cfg){const response=await fetch('./config/stocks.json',{cache:'no-cache'});if(!response.ok)throw new Error('Stock configuration unavailable');cfg=await response.json();
        if(!Array.isArray(cfg.categories))throw new Error('Invalid category file');
        cfg.categories.forEach(category => category.tickers.forEach(item=>{if(SYMBOL.test(item.symbol))catalog.set(item.symbol,{name:item.name,category});}));
      }
      const response=await fetch(`./data/quotes.json?v=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)throw new Error('Stock snapshot unavailable');
      const candidate=await response.json();
      if(!candidate.stocks||typeof candidate.stocks!=='object')throw new Error('Malformed stock snapshot');
      if(!feed || feed.generated_at!==candidate.generated_at || feed.mode!==candidate.mode){
        feed=candidate;try{localStorage.setItem('market-rain-latest-data',JSON.stringify(feed));}catch{}
        renderAll();
      }
      if(initialLoad){setFeedback(feed.mode==='demo'?'DEMO MODE — ALL PRICES & CHARTS ARE SIMULATED. RUN THE GITHUB ACTION TO LOAD A MARKET SNAPSHOT.':'MARKET SNAPSHOT LOADED. TYPE A SYMBOL OR HELP.','success');}
    }catch(error){
      if(!cfg){setFeedback('CONFIGURATION FAILED TO LOAD. DEPLOY TO GITHUB PAGES OR USE A LOCAL WEB SERVER.','error');return;}
      if(!feed){try{const cached=JSON.parse(localStorage.getItem('market-rain-latest-data'));if(cached?.stocks){feed=cached;renderAll();setFeedback('OFFLINE — SHOWING LAST SAVED MARKET SNAPSHOT.','error');return;}}catch{}}
      if(feed){setFeedback('REFRESH FAILED — KEEPING LAST LOADED DATA.','error');return;}
      setFeedback('DATA UNAVAILABLE. CHECK GITHUB ACTIONS / DATA/QUOTES.JSON.','error');
    }
  }
  function renderAll(){
    if(!cfg||!feed)return;
    state.watch=state.watch.filter(t=>catalog.has(t));
    renderStatus();renderRibbon();renderWatch();renderRadar();renderRain();
    updateMotion();updateTab();save();
    // On small screens the Rain tab is hidden until updateTab sets display:flex.
    // Measure canvases only after the layout becomes visible.
    requestAnimationFrame(()=>{setupCanvases();if(state.paused)drawStillRain();});
    if(selectedTicker && getStock(selectedTicker))renderDetails(selectedTicker);
  }
  function renderStatus(){
    const demo=feed.mode==='demo';
    const flag=$('sourceFlag'), dot=document.querySelector('.pulse-dot');
    flag.textContent=demo?'SIMULATED DEMO':(feed.carried_forward||feed.unavailable?.length)?'PARTIAL / STALE SNAPSHOT':'DELAYED DAILY SNAPSHOT';
    flag.style.color=demo?'var(--amber)':'var(--green)';
    dot.style.background=demo?'var(--amber)':'var(--green)';
    $('lastUpdated').textContent=demo?'NO LIVE PRICE FEED':`FETCH ${whenString(feed.generated_at)}`;
    let up=0,down=0;
    Object.values(feed.stocks).forEach(s=>{if(movement(s.change_pct)==='up')up++;else if(movement(s.change_pct)==='down')down++;});
    $('matrixTotals').textContent=`${up} ADVANCING / ${down} DECLINING`;
    $('trackedTime').textContent=demo?'SYNTHETIC EXAMPLE PRICES':'LAST SESSION CLOSE • NOT LIVE';
  }
  function renderRibbon(){
    const tickers=['AAPL','MSFT','NVDA','JPM','XOM','TSLA','FPH.NZ','AMZN','LLY','AIA.NZ'];
    $('tickerRibbon').innerHTML=tickers.filter(t=>getStock(t)).map(t=>{
      const s=getStock(t);return `<span class="ribbon-item"><span class="ribbon-symbol">${safe(t)}</span><span>${num(s.price)}</span><span class="ribbon-${movement(s.change_pct)}">${pct(s.change_pct)}</span></span>`;
    }).join('')||'<span class="ribbon-item">NO STOCK DATA AVAILABLE</span>';
  }
  function renderWatch(){
    $('watchCount').textContent=String(state.watch.length).padStart(2,'0');
    const list=$('watchItems');list.innerHTML='';
    if(!state.watch.length){list.innerHTML='<div class="empty-state">NOTHING ON YOUR WATCHLIST.<br>TYPE <b>WATCH AAPL</b> TO GET STARTED.</div>';return;}
    for(const ticker of state.watch){
      const s=getStock(ticker); const button=document.createElement('button');button.type='button';button.className='watch-entry';
      const movementClass=movement(s?.change_pct);
      button.innerHTML=`<span class="watch-stock"><strong>${safe(ticker)}</strong><small>${safe(getName(ticker))}</small><small>${s?fmtPrice(s):'NO SNAPSHOT'}</small></span><span class="watch-change ${movementClass}">${s?pct(s.change_pct):'—'}</span>`;
      button.addEventListener('click',()=>openDetails(ticker));list.appendChild(button);
    }
  }
  function indicators(stock){
    const prices=(stock.history||[]).map(h=>rawNum(h[1])).filter(p=>p!==null && p>0);
    const price=rawNum(stock.price),low=rawNum(stock.low_52w),high=rawNum(stock.high_52w);
    if(prices.length<20||price===null||low===null||high===null||high<=low)return null;
    const position=clamp((price-low)/(high-low),0,1);
    const diffs=prices.slice(-15).map((p,i,a)=>i===0?0:p-a[i-1]).slice(1);
    let gain=0,loss=0;diffs.forEach(n=>{if(n>0)gain+=n;else loss-=n;});
    const rsi=loss===0?(gain===0?50:100):100-(100/(1+(gain/loss)));
    const fiveDay=prices.length>=6?((price/prices[prices.length-6]-1)*100):0;
    // Rules-based discovery, not a recommendation or prediction.
    if(position>0.40 && rsi>40)return null;
    const score=clamp(Math.round((1-position)*67 + Math.max(0,45-rsi)*.75 + (fiveDay>0?6:0)),0,99);
    const reasons=[];
    if(position<=.40)reasons.push(`${Math.round(position*100)}% OF 52W RANGE`);
    if(rsi<=40)reasons.push(`RSI ${Math.round(rsi)}`);
    if(fiveDay>0)reasons.push('5D MOMENTUM ↑');
    return {score,position,rsi,fiveDay,reasons};
  }
  function renderRadar(){
    const candidates=[];
    for(const ticker of catalog.keys()){const stock=getStock(ticker);if(!stock||stock.stale)continue;const scan=indicators(stock);if(scan)candidates.push({ticker,scan,stock});}
    candidates.sort((a,b)=>b.scan.score-a.scan.score);
    const container=$('radarItems');container.innerHTML='';
    const top=candidates.slice(0,8);
    if(!top.length){container.innerHTML='<div class="empty-state">NO SYMBOLS MATCH THIS SCAN RIGHT NOW.<br><br>THE SCREEN USES 52-WEEK POSITION AND RSI. IT DOES NOT PREDICT FUTURE GAINS.</div>';return;}
    top.forEach(({ticker,scan,stock})=>{
      const item=document.createElement('button');item.type='button';item.className='radar-item';
      item.innerHTML=`<div class="radar-item-top"><strong>${safe(ticker)}</strong><span class="score">${scan.score} / 99</span></div><div class="radar-item-name">${safe(getName(ticker))} · ${fmtPrice(stock)}</div><div class="radar-item-reason">${safe(scan.reasons.join('  ·  '))}</div>`;
      item.addEventListener('click',()=>openDetails(ticker));container.appendChild(item);
    });
  }
  function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),16777619);}return h>>>0;}
  function durationFor(ticker){const scale={slow:1.5,normal:1,fast:.58}[state.speed];return (22+(hash(ticker)%12))*scale;}
  function renderRain(){
    const container=$('rainColumns');container.innerHTML='';canvases=[];tickerSpecs=[];
    for(const category of cfg.categories){
      const lane=document.createElement('div');lane.className='rain-lane';lane.dataset.category=category.id;
      const canvas=document.createElement('canvas');canvas.className='rain-canvas';canvas.setAttribute('aria-hidden','true');lane.appendChild(canvas);
      const fade=document.createElement('div');fade.className='rain-fade';lane.appendChild(fade);
      const catTickers=getCategoryTickers(category);
      const catHtml=document.createElement('div');catHtml.className='lane-top';catHtml.innerHTML=`<b>${safe(category.short||category.label)}</b><span>${String(catTickers.length).padStart(2,'0')} SYMBOLS</span>`;
      lane.appendChild(catHtml);
      if(!catTickers.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent='NO DATA';lane.appendChild(empty);}
      catTickers.forEach((ticker,index)=>{
        const stock=getStock(ticker);const motionClass=movement(stock.change_pct);
        for(let copy=0;copy<2;copy++){
          const node=document.createElement('button');node.type='button';node.className=`falling-stock ${motionClass}${copy?' compact':''}`;
          node.innerHTML=`<span class="symbol">${safe(ticker)}</span><span class="move">${pct(stock.change_pct)}</span>`;
          node.title=`${getName(ticker)}: ${pct(stock.change_pct)}; click for details`;
          const dur=durationFor(ticker)*(copy?1.18:1);
          const stagger=index*dur/Math.max(1,catTickers.length);
          const x=copy? 18+(hash(ticker+'b')%9):3+(hash(ticker)%9);
          node.style.setProperty('--duration',dur+'s');node.style.setProperty('--delay',`-${(stagger+copy*dur*.49).toFixed(1)}s`);node.style.setProperty('--x',x+'%');
          node.addEventListener('click',()=>openDetails(ticker));lane.appendChild(node);
          tickerSpecs.push({node,ticker,copy});
        }
      });
      container.appendChild(lane);canvases.push({canvas,lane,ctx:canvas.getContext('2d',{alpha:true}),columns:[],palette:catTickers.map(t=>movement(getStock(t)?.change_pct))});
    }
    setupCanvases();
    if(raf!==null)cancelAnimationFrame(raf);raf=null;rainLast=0;
    if(!state.paused)raf=requestAnimationFrame(drawRain);
    else drawStillRain();
  }
  function setupCanvases(){
    const step={low:23,medium:16,high:12}[state.density];
    for(const entry of canvases){
      const w=Math.max(1,entry.lane.clientWidth),h=Math.max(1,entry.lane.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
      entry.canvas.width=Math.ceil(w*dpr);entry.canvas.height=Math.ceil(h*dpr);entry.canvas.style.width=w+'px';entry.canvas.style.height=h+'px';
      entry.ctx.setTransform(dpr,0,0,dpr,0,0);entry.ctx.fillStyle='#06120c';entry.ctx.fillRect(0,0,w,h);
      entry.w=w;entry.h=h;entry.step=step;
      entry.columns=Array.from({length:Math.max(1,Math.floor(w/step))},(_,i)=>({x:i*step+1,y:(hash(entry.lane.dataset.category+':'+i)%Math.max(h,1))-h,speed:1+(hash('speed:'+i+entry.lane.dataset.category)%40)/30,kind:entry.palette[i%Math.max(1,entry.palette.length)]||'flat'}));
      entry.lane.style.setProperty('--travel',h+'px');
    }
  }
  const letters='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエカキクケサタナハマヤラワ';
  function drawFrame(){
    for(const entry of canvases){
      const {ctx,w,h,step,columns}=entry;if(!ctx||!w||!h)continue;
      ctx.fillStyle='rgba(5,15,9,0.19)';ctx.fillRect(0,49,w,h-49);
      ctx.font=`${Math.max(10,step-2)}px monospace`;ctx.textAlign='left';
      for(let index=0;index<columns.length;index++){
        const col=columns[index];col.y+=(step*.38*col.speed);
        if(col.y>h+step*15)col.y=-(hash(String(index)+Math.floor(performance.now()/2000))%15+2)*step;
        const glyph=letters[(Math.random()*letters.length)|0];
        const primary=col.kind==='up'?[39,255,144]:col.kind==='down'?[255,67,102]:[122,175,135];
        ctx.shadowBlur=index%4===0?6:0;ctx.shadowColor=`rgb(${primary.join(',')})`;
        ctx.fillStyle=`rgba(${primary[0]},${primary[1]},${primary[2]},${index%8===0?.9:.54})`;
        if(col.y>49)ctx.fillText(glyph,col.x,col.y);
      }
      ctx.shadowBlur=0;
    }
  }
  function drawStillRain(){
    for(const entry of canvases){
      const {ctx,w,h,step,columns}=entry;if(!ctx)continue;ctx.fillStyle='#07130e';ctx.fillRect(0,0,w,h);
      ctx.font=`${Math.max(10,step-2)}px monospace`;
      columns.forEach((col,i)=>{
        for(let j=0;j<16;j++){const y=55+j*step*1.6+((hash('y:'+i)%11)*7);if(y>h)break;
          const glyph=letters[hash('glyph'+i+'-'+j)%letters.length];
          ctx.fillStyle=col.kind==='down'?'#8e303d':col.kind==='up'?'#136c3d':'#38614b';ctx.fillText(glyph,col.x,y);
        }
      });
    }
  }
  function drawRain(t){
    if(state.paused){raf=null;return;}
    if(t-rainLast>45){drawFrame();rainLast=t;}
    raf=requestAnimationFrame(drawRain);
  }
  function updateMotion(){
    document.body.classList.toggle('no-animation',state.paused);
    const btn=$('pauseButton');btn.textContent=state.paused?'▶':'Ⅱ';btn.title=state.paused?'Resume animation (P)':'Pause animation (P)';
    $('motionToggle').checked=!state.paused;
    $('densitySelect').value=state.density;$('speedSelect').value=state.speed;
    if(state.paused){if(raf!==null)cancelAnimationFrame(raf);raf=null;drawStillRain();}
    else if(raf===null)raf=requestAnimationFrame(drawRain);
  }
  function toggleMotion(){state.paused=!state.paused;save();updateMotion();setFeedback(state.paused?'ANIMATION PAUSED. MARKET DATA IS UNCHANGED.':'ANIMATION RUNNING.','success');}
  function updateTab(){document.querySelector('.app').dataset.tab=state.tab;document.querySelectorAll('.mobile-tabs button').forEach(button=>button.classList.toggle('active',button.dataset.tab===state.tab));}
  function changeTab(tab){state.tab=tab;updateTab();setTimeout(setupCanvases,60);}

  function sliceHistory(item,range){const days={'1M':31,'3M':95,'6M':186,'1Y':367}[range]||95;const hist=(item.history||[]).filter(p=>Array.isArray(p)&&Number.isFinite(Number(p[1]))).map(p=>[String(p[0]),Number(p[1])]);if(!hist.length)return [];
    const lastDate=new Date(hist[hist.length-1][0]+'T12:00:00Z');if(Number.isNaN(lastDate.getTime()))return hist.slice(-70);
    const limit=lastDate.getTime()-days*86400000;return hist.filter(p=>Date.parse(p[0]+'T12:00:00Z')>=limit);
  }
  function makeChart(item,range){
    const pts=sliceHistory(item,range);
    if(pts.length<2)return '<div class="empty-state">NO HISTORICAL DATA AVAILABLE FOR THIS WINDOW.</div>';
    const vals=pts.map(p=>p[1]);let low=Math.min(...vals),high=Math.max(...vals);const pad=(high-low)*.10||Math.abs(high)*.015||1;low-=pad;high+=pad;
    const W=700,H=230,P=16,PY=20,usableW=W-P*2,usableH=H-PY*2;
    const points=vals.map((v,i)=>({x:P+(i/(vals.length-1))*usableW,y:PY+(1-(v-low)/(high-low))*usableH}));
    const path=points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const fill=path+` L ${points.at(-1).x.toFixed(2)} ${H-PY} L ${P} ${H-PY} Z`;
    const positive=vals.at(-1)>=vals[0],color=positive?PALETTE.up:PALETTE.down;
    const grid=[.25,.5,.75].map(k=>`<line x1="${P}" x2="${W-P}" y1="${(PY+usableH*k).toFixed(1)}" y2="${(PY+usableH*k).toFixed(1)}" stroke="#1b4230" stroke-dasharray="2 5"/>`).join('');
    return `<div class="chart-frame" id="chartFrame"><svg class="chart-svg" id="priceChart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${safe(range)} historical price chart"><defs><linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".23"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${fill}" fill="url(#chartGradient)"/><path d="${path}" stroke="${color}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round" fill="none" vector-effect="non-scaling-stroke"/><line id="chartCursor" y1="20" y2="210" stroke="${color}" stroke-width="1" stroke-dasharray="5 4" visibility="hidden"/></svg><div class="chart-hover" id="chartHover"></div></div><div class="chart-foot"><span>${safe(dayString(pts[0][0]))}</span><span>DAILY CLOSE • ${safe(item.currency||'')}</span><span>${safe(dayString(pts.at(-1)[0]))}</span></div>`;
  }
  function addChartHover(item){
    const svg=$('priceChart'),tooltip=$('chartHover'),cursor=$('chartCursor');if(!svg||!tooltip)return;
    const pts=sliceHistory(item,chartRange);
    svg.addEventListener('pointermove',e=>{
      const rect=svg.getBoundingClientRect(),ratio=clamp((e.clientX-rect.left)/rect.width,0,1);
      const index=clamp(Math.round(ratio*(pts.length-1)),0,pts.length-1),point=pts[index];
      if(!point)return;tooltip.textContent=`${dayString(point[0])}: ${num(point[1])} ${item.currency||''}`;
      cursor.setAttribute('x1',String(16+ratio*668));cursor.setAttribute('x2',String(16+ratio*668));cursor.setAttribute('visibility','visible');
    });
    svg.addEventListener('pointerleave',()=>{cursor.setAttribute('visibility','hidden');tooltip.style.opacity='0';});
    svg.addEventListener('pointerenter',()=>{tooltip.style.opacity='1';});
  }
  function renderDetails(ticker){
    const stock=getStock(ticker);if(!stock){setFeedback(`NO SNAPSHOT AVAILABLE FOR ${ticker}.`,'error');return;}
    selectedTicker=ticker;
    const demo=feed.mode==='demo',move=movement(stock.change_pct);
    const dividends=(stock.dividends||[]).filter(d=>Array.isArray(d)&&validNum(d[1])&&Number(d[1])>0).slice(-5).reverse();
    const dividendTotal=(stock.dividends||[]).reduce((total,d)=>total+(Number(d[1])||0),0);
    const dividendYield=stock.price>0?dividendTotal/stock.price*100:null;
    const watched=state.watch.includes(ticker);
    const scan=indicators(stock);
    $('detailContent').innerHTML=`<div class="dialog-eyebrow">${safe(getCategory(ticker))} // STOCK DETAIL</div>
      <div class="detail-top"><div><div class="detail-title" id="detailTitle">${safe(ticker)}</div><div class="detail-company">${safe(getName(ticker))} · ${safe(stock.currency||'CURRENCY UNKNOWN')}</div></div><div class="detail-price"><strong>${num(stock.price)}</strong><span class="change ${move}">${pct(stock.change_pct)} DAILY</span></div></div>
      <div class="source-banner ${demo?'demo':''}">${demo?'SIMULATED / DEMO DATA — DO NOT USE PRICES FOR DECISIONS.':`DELAYED MARKET SNAPSHOT. LATEST DAILY CLOSE: ${dayString(stock.asof)}. CAPTURED ${whenString(feed.generated_at)}.`}${stock.stale?" · THIS SYMBOL'S LAST KNOWN VALUES WERE RETAINED AFTER A FAILED REFRESH.":''}</div>
      <div class="detail-stats"><div class="detail-stat"><label>PREVIOUS CLOSE</label><strong>${num(stock.previous_close)}</strong></div><div class="detail-stat"><label>52-WEEK HIGH</label><strong>${num(stock.high_52w)}</strong></div><div class="detail-stat"><label>52-WEEK LOW</label><strong>${num(stock.low_52w)}</strong></div><div class="detail-stat"><label>LAST SESSION VOLUME</label><strong>${num(stock.volume,0)}</strong></div></div>
      <div class="chart-heading"><h3>▥ PRICE HISTORY</h3><div class="chart-ranges">${['1M','3M','6M','1Y'].map(r=>`<button class="range-button ${r===chartRange?'active':''}" data-range="${r}" type="button">${r}</button>`).join('')}</div></div>
      <div id="chartContainer">${makeChart(stock,chartRange)}</div>
      <section class="dividend-section"><h3 class="dividend-heading">↘ DIVIDEND TRACKING / 12-MONTH HISTORY</h3><div class="dividend-total">TOTAL RECORDED: ${num(dividendTotal,3)} ${safe(stock.currency||'')} PER SHARE ${dividendYield!==null?` · INDICATIVE TRAILING YIELD ${num(dividendYield)}%`:''}</div><div class="dividend-list">${dividends.length?dividends.map(d=>`<span class="dividend-pill">${safe(dayString(d[0]))} &nbsp; +${num(d[1],3)}</span>`).join(''):'<span class="dividend-pill">NO RECORDED CASH DIVIDENDS IN THIS PERIOD</span>'}</div></section>
      ${scan?`<div class="source-banner">RADAR: ${scan.reasons.map(safe).join(' · ')}. THIS IS A TECHNICAL SCREEN, NOT A BUY RECOMMENDATION.</div>`:''}
      <div class="detail-actions"><button type="button" class="action-button" id="detailWatchButton">${watched?'− REMOVE FROM WATCHLIST':'+ ADD TO WATCHLIST'}</button><a class="action-button secondary" target="_blank" rel="noopener noreferrer" href="https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/">OPEN SOURCE PAGE ↗</a></div>
      <p class="detail-note">Prices and returns are displayed in the ticker's listing currency. Charts show daily closes, not intraday trades. Dividend totals are historical cash amounts and do not guarantee future payments. Data may be delayed, incomplete or subject to vendor restrictions. This project is for research and visualisation, not financial advice.</p>`;
    $('detailWatchButton').addEventListener('click',()=>{toggleWatch(ticker);renderDetails(ticker);});
    document.querySelectorAll('[data-range]').forEach(b=>b.addEventListener('click',()=>{chartRange=b.dataset.range;renderDetails(ticker);}));
    addChartHover(stock);
  }
  function openDetails(ticker){if(!getStock(ticker)){setFeedback(`NO DATA FOR ${ticker}. EDIT CONFIG/STOCKS.JSON AND RUN UPDATE MARKET DATA.`, 'error');return;}chartRange='3M';$('detailOverlay').hidden=false;activeOverlay='detail';renderDetails(ticker);$('detailClose').focus();}
  function toggleWatch(ticker,force){
    if(!catalog.has(ticker)){setFeedback(`${ticker} IS NOT IN THE CONFIGURED UNIVERSE. ADD IT TO CONFIG/STOCKS.JSON FIRST.`, 'error');return;}
    if(force===false||force===undefined&&state.watch.includes(ticker)){
      state.watch=state.watch.filter(t=>t!==ticker);setFeedback(`${ticker} REMOVED FROM WATCHLIST.`, 'success');
    } else {
      if(!state.watch.includes(ticker)){state.watch.push(ticker);setFeedback(`${ticker} ADDED TO WATCHLIST.`, 'success');}
      else setFeedback(`${ticker} IS ALREADY ON YOUR WATCHLIST.`);
    }
    save();renderWatch();
  }
  function showOverlay(name){
    closeOverlay();activeOverlay=name;const modal=$(name+'Overlay');if(modal){modal.hidden=false;modal.querySelector('button')?.focus();}
  }
  function closeOverlay(){for(const x of ['detail','help','settings'])$(x+'Overlay').hidden=true;activeOverlay=null;selectedTicker=null;}
  function showHelp(type='help'){
    const install=type==='install',ios=/iPad|iPhone|iPod/.test(navigator.userAgent);
    $('helpContent').innerHTML=install?`<div class="dialog-eyebrow">PWA // CUSTOM ICON + STANDALONE MODE</div><h2 id="helpTitle">INSTALL MARKET RAIN</h2><p class="help-intro">Market Rain is a progressive web app: once installed, it launches in its own window without the usual browser address bar.</p><ol class="install-steps">${ios?'<li>Open your GitHub Pages link in Safari (or another iOS browser with Share support).</li><li>Tap <b>Share</b> → <b>Add to Home Screen</b>.</li><li>Enable <b>Open as Web App</b> if offered, then tap <b>Add</b>.</li>':'<li>Open your GitHub Pages site in Chrome or Samsung Internet on Android.</li><li>Tap the browser menu → <b>Install app</b> (not a generic shortcut).</li><li>Accept installation to get the custom Market Rain icon and standalone app experience.</li>'}</ol><p class="detail-note">Browser-badged shortcuts depend on your device and browser. Chrome with Google Play services or Samsung Internet supports proper Android PWA installation. This is not a native APK or App Store download.</p>`:
    `<div class="dialog-eyebrow">TERMINAL OPERATIONS // REFERENCE</div><h2 id="helpTitle">COMMAND INDEX</h2><p class="help-intro">Type commands in the bottom console and press Enter. The configured symbols appear across the sector rain.</p>${[
      ['AAPL','Open stock information, chart and dividends.'],['WATCH AAPL','Add a symbol to your personal watchlist.'],['UNWATCH AAPL','Remove a symbol from your watchlist.'],['LIST','Show watched symbols in the console.'],['SCAN','Open the blue radar panel.'],['TECH / NZX','Jump to a stock category.'],['PAUSE / RESUME','Control the falling animation.'],['INSTALL','Install as a standalone mobile/desktop app.'],['HELP / ?','Open this list.']
    ].map(([a,b])=>`<div class="help-grid"><code>${safe(a)}</code><span>${safe(b)}</span></div>`).join('')}<p class="detail-note">Only symbols configured in CONFIG/STOCKS.JSON are available in the static snapshot. Update that file and run the GitHub Action to cover additional stocks.</p>`;
    showOverlay('help');
  }
  function showSettings(){showOverlay('settings');}
  async function installApp(){
    if(deferredInstall){try{deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;}catch{showHelp('install');}}
    else showHelp('install');
  }
  function runCommand(value){
    const original=value.trim(), cmd=original.toUpperCase().replace(/\s+/g,' ');
    if(!cmd)return;
    $('commandInput').value='';
    if(['HELP','?','COMMANDS'].includes(cmd)){showHelp();return;}
    if(cmd==='PAUSE'||cmd==='RESUME'){if((cmd==='PAUSE'&&!state.paused)||(cmd==='RESUME'&&state.paused))toggleMotion();else setFeedback(`ANIMATION ALREADY ${state.paused?'PAUSED':'RUNNING'}.`);return;}
    if(['INSTALL','APP'].includes(cmd)){installApp();return;}
    if(['SCAN','RADAR'].includes(cmd)){changeTab('radar');setFeedback('RADAR: 52-WEEK POSITION + RSI SCREENING. NOT BUY SIGNALS.');return;}
    if(cmd==='LIST'){changeTab('watch');setFeedback(`WATCHLIST: ${state.watch.join(', ')||'EMPTY'}`);return;}
    if(cmd==='CLEAR'){setFeedback('SYSTEM READY. TYPE HELP TO SEE COMMANDS.');return;}
    if(cmd.startsWith('WATCH ')||cmd.startsWith('ADD ')){const sym=cmd.split(' ').slice(1).join(' ').trim();if(SYMBOL.test(sym)){toggleWatch(sym,true);return;}}
    if(cmd.startsWith('UNWATCH ')||cmd.startsWith('REMOVE ')){const sym=cmd.split(' ').slice(1).join(' ').trim();if(SYMBOL.test(sym)){toggleWatch(sym,false);return;}}
    const category=cfg?.categories.find(c=>cmd===c.short||cmd===c.id.toUpperCase()||cmd===c.label);
    if(category){changeTab('rain');const lane=document.querySelector(`[data-category="${category.id}"]`);lane?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});setFeedback(`${category.label} STREAM SELECTED.`,'success');return;}
    const found=cmd.startsWith('OPEN ')?cmd.slice(5):cmd;
    if(catalog.has(found)){openDetails(found);return;}
    // Static catalog also supports company names, not only ticker codes.
    const matches=[...catalog.entries()].filter(([,item])=>item.name.toUpperCase()===found || item.name.toUpperCase().startsWith(found));
    if(matches.length===1){openDetails(matches[0][0]);return;}
    if(matches.length>1){setFeedback(`MULTIPLE COMPANIES MATCH ${found}: ${matches.slice(0,6).map(([code])=>code).join(', ')}. TYPE A SYMBOL.`);return;}
    setFeedback(`${safe(original)} NOT FOUND. TRY AAPL, MSFT, FPH.NZ OR HELP. FOR NEW SYMBOLS, EDIT CONFIG/STOCKS.JSON.`, 'error');
  }
  function bind(){
    $('commandForm').addEventListener('submit',e=>{e.preventDefault();runCommand($('commandInput').value);});
    $('watchAddButton').addEventListener('click',()=>{$('commandInput').value='WATCH ';$('commandInput').focus();});
    document.querySelectorAll('[data-command]').forEach(el=>el.addEventListener('click',()=>runCommand(el.dataset.command)));
    $('pauseButton').addEventListener('click',toggleMotion);
    $('installButton').addEventListener('click',installApp);
    $('settingsButton').addEventListener('click',showSettings);
    $('detailClose').addEventListener('click',closeOverlay);
    document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',closeOverlay));
    document.querySelectorAll('.mobile-tabs button').forEach(el=>el.addEventListener('click',()=>changeTab(el.dataset.tab)));
    $('densitySelect').addEventListener('change',e=>{state.density=e.target.value;save();setupCanvases();if(state.paused)drawStillRain();});
    $('speedSelect').addEventListener('change',e=>{state.speed=e.target.value;save();tickerSpecs.forEach(spec=>spec.node.style.setProperty('--duration',durationFor(spec.ticker)*(spec.copy?1.18:1)+'s'));});
    $('motionToggle').addEventListener('change',e=>{state.paused=!e.target.checked;save();updateMotion();});
    document.addEventListener('keydown',e=>{
      const inputActive=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
      if(e.key==='Escape'){if(activeOverlay)closeOverlay();else $('commandInput').blur();}
      if((e.key==='/'||e.key==='?')&&!inputActive&&!activeOverlay){e.preventDefault();if(e.key==='?')showHelp();else $('commandInput').focus();}
      if(e.key.toLowerCase()==='p'&&!inputActive&&!activeOverlay)toggleMotion();
    });
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;});
    window.addEventListener('resize',()=>{clearTimeout(window.__marketResize);window.__marketResize=setTimeout(()=>{setupCanvases();if(state.paused)drawStillRain();},180);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){if(raf!==null)cancelAnimationFrame(raf);raf=null;}else if(!state.paused&&raf===null)raf=requestAnimationFrame(drawRain);});
    // No live API polling; refresh our static GitHub-generated snapshot.
    setInterval(()=>{if(!document.hidden)loadData(false);},10*60*1000);
  }
  bind();
  loadData(true);
  if('serviceWorker' in navigator && location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
