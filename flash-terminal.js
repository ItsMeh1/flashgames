(() => {
  'use strict';

  const state = { modules: new Map(), history: [], index: -1 };
  const safeStorageKeys = new Set(['flashgames.offline.session.v1']);
  const blockedKey = /(token|secret|password|credential|auth|firebase|session|game|progress|score|xp|currency|coins|save)/i;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const print = (out, text, type = '') => { const p = document.createElement('div'); p.className = `terminal-line ${type}`; p.textContent = text; out.appendChild(p); out.scrollTop = out.scrollHeight; };
  const add = (module) => { if (!module?.name || typeof module.commands !== 'object') return false; state.modules.set(module.name, Object.freeze(module)); return true; };

  add({ name:'system', description:'Safe browser and app diagnostics.', commands:{
    help:({out}) => print(out,'Use help, status, modules, clear, or <module> help.'),
    status:({out}) => print(out,`online=${navigator.onLine} | visibility=${document.visibilityState} | language=${navigator.language}`),
    time:({out}) => print(out,new Date().toString())
  }});
  add({ name:'browser', description:'Read-only browser diagnostics.', commands:{
    help:({out}) => print(out,'browser info | browser storage | browser viewport'),
    info:({out}) => print(out,`${navigator.userAgent}`),
    storage:({out}) => print(out,`localStorage=${typeof localStorage !== 'undefined'} | cacheStorage=${'caches' in window}`),
    viewport:({out}) => print(out,`${innerWidth}x${innerHeight} @ ${devicePixelRatio}x`)
  }});
  add({ name:'offline', description:'Service worker and cache diagnostics.', commands:{
    help:({out}) => print(out,'offline status | offline caches | offline games'),
    status:async({out}) => { print(out,`online=${navigator.onLine}`); print(out,`controller=${!!navigator.serviceWorker?.controller}`); },
    caches:async({out}) => { const names = await caches.keys(); print(out,names.length ? names.join('\n') : 'No Cache Storage entries found.'); },
    games:async({out}) => { try { const games = await window.FlashGamesStore?.getAllCachedGames?.() || []; print(out,`${games.length} installed game(s). Names are intentionally omitted from terminal output.`); } catch { print(out,'Game cache could not be inspected.','error'); } }
  }});
  add({ name:'localstorage', description:'Inspect non-sensitive storage metadata only.', commands:{
    help:({out}) => print(out,'localstorage keys | localstorage get <key>'),
    keys:({out}) => { const keys = []; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && !blockedKey.test(k)) keys.push(k); } print(out,keys.length ? keys.join('\n') : 'No non-sensitive keys available.'); },
    get:({out,args}) => { const k=args.join(' ').trim(); if(!k) return print(out,'Usage: localstorage get <key>','error'); if(blockedKey.test(k) || !safeStorageKeys.has(k)) return print(out,'That key is protected from terminal access.','error'); const value=localStorage.getItem(k); print(out,value === null ? 'Key not found.' : value); }
  }});
  add({ name:'session', description:'Read-only current-account diagnostics.', commands:{
    help:({out}) => print(out,'session status'),
    status:({out}) => { const user=window.__flashFirebase?.auth?.currentUser; const cached=window.FlashOfflineSession?.read?.(); print(out,`firebaseUser=${!!user}`); print(out,`uid=${user?.uid ? '[redacted]' : 'none'}`); print(out,`offlineVerificationCache=${!!cached}`); }
  }});

  function registerBuiltInExtensions() { window.FlashTerminal?.extensions?.forEach(add); }
  function run(out, raw) {
    const input=raw.trim(); if(!input) return;
    state.history.push(input); state.index=state.history.length;
    const parts=input.split(/\s+/), head=parts.shift().toLowerCase();
    if(head==='clear'){out.textContent='';return;}
    if(head==='modules'){ for(const [name,m] of state.modules) print(out,`${name} — ${m.description}`); return; }
    if(head==='help'){ print(out,'Flash Terminal — safe diagnostics only.'); print(out,'Modules: '+[...state.modules.keys()].join(', ')); print(out,'Commands: <module> <command>, modules, clear'); return; }
    const module=state.modules.get(head); if(!module) return print(out,`Unknown command/module: ${head}`,'error');
    const command=(parts.shift()||'help').toLowerCase(); const fn=module.commands[command];
    if(typeof fn!=='function') return print(out,`Unknown ${head} command: ${command}`,'error');
    Promise.resolve(fn({out,args:parts})).catch(()=>print(out,'Command failed safely.','error'));
  }

  function mount() {
    if(document.getElementById('flashTerminal')) return;
    registerBuiltInExtensions();
    const button=document.createElement('button'); button.className='icon-btn flash-terminal-trigger'; button.type='button'; button.title='Flash Terminal (Alt/Option+T)'; button.setAttribute('aria-label','Flash Terminal'); button.innerHTML='<i data-lucide="terminal"></i>'; document.querySelector('.top-actions')?.appendChild(button);
    const backdrop=document.createElement('div'); backdrop.id='flashTerminal'; backdrop.className='modal-backdrop'; backdrop.hidden=true;
    backdrop.innerHTML='<section class="flash-terminal glass" role="dialog" aria-modal="true" aria-labelledby="flashTerminalTitle"><div class="panel-head"><div><span class="eyebrow">DEVELOPER TOOLS</span><h2 id="flashTerminalTitle">Flash Terminal</h2></div><button class="icon-btn" data-terminal-close aria-label="Close"><i data-lucide="x"></i></button></div><div class="terminal-body"><div id="flashTerminalOutput" class="terminal-output" aria-live="polite"></div><form id="flashTerminalForm" class="terminal-form"><span>&gt;</span><input id="flashTerminalInput" autocomplete="off" spellcheck="false" placeholder="system status"><button class="btn primary" type="submit">Run</button></form><p class="panel-note">Read-only diagnostics. Terminal commands cannot change sessions, accounts, game saves, scores, currency, XP, or progress.</p></div></section></div>';
    document.body.appendChild(backdrop);
    const out=backdrop.querySelector('#flashTerminalOutput'), input=backdrop.querySelector('#flashTerminalInput');
    const open=()=>{backdrop.hidden=false; input.focus(); if(!out.childElementCount) print(out,'Flash Terminal ready. Type help.');};
    const close=()=>{backdrop.hidden=true;};
    button.addEventListener('click',open); backdrop.addEventListener('click',e=>{if(e.target===backdrop||e.target.closest('[data-terminal-close]'))close();});
    backdrop.querySelector('#flashTerminalForm').addEventListener('submit',e=>{e.preventDefault(); const v=input.value; input.value=''; print(out,`> ${v}`,'command'); run(out,v);});
    input.addEventListener('keydown',e=>{if(e.key==='ArrowUp'){e.preventDefault();state.index=Math.max(0,state.index-1);input.value=state.history[state.index]||'';}if(e.key==='ArrowDown'){e.preventDefault();state.index=Math.min(state.history.length,state.index+1);input.value=state.history[state.index]||'';}if(e.key==='Escape')close();});
    window.addEventListener('keydown',e=>{if((e.altKey||e.metaKey)&&e.key.toLowerCase()==='t'){e.preventDefault();open();}});
    window.lucide?.createIcons?.({root:backdrop,attrs:{'stroke-width':1.5}}); window.lucide?.createIcons?.({root:button,attrs:{'stroke-width':1.5}});
  }

  window.FlashTerminalAPI = Object.freeze({ register:add, list:()=>[...state.modules.keys()] });
  window.addEventListener('DOMContentLoaded',mount,{once:true});
})();
