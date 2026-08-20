(() => {
  'use strict';
  const CACHE='arc.games.cache.v4', TTL=300000;
  const normalize=items=>Array.isArray(items)?items.filter(Boolean).map((g,i)=>({id:String(g.id??g.slug??g.name??`game-${i}`),name:String(g.name??g.title??'Untitled game'),category:String(g.category??g.genre??'Games'),zone:String(g.zone??g.type??'OFFLINE'),url:String(g.url??g.launchUrl??''),cover:String(g.cover??g.thumbnail??g.image??''),description:String(g.description??'Ready to play.'),tags:Array.isArray(g.tags)?g.tags.map(String):[]})).filter(g=>g.url):[];
  async function json(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);try{const r=await fetch(url,{signal:c.signal,cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json()}finally{clearTimeout(t)}}
  const read=()=>{try{const x=JSON.parse(localStorage.getItem(CACHE)||'null');return x&&Date.now()-x.time<TTL?normalize(x.games):null}catch{return null}};
  const write=games=>{try{localStorage.setItem(CACHE,JSON.stringify({time:Date.now(),games}))}catch{}};
  async function load(force=false){if(!force){const c=read();if(c?.length)return c}let games=[];const base=(localStorage.getItem('arc.api')||window.ARC_API_BASE||'').replace(/\/$/,'');if(base){for(const u of [`${base}/games.json`,`${base}/api/games`,base]){try{games=normalize(await json(u));if(games.length)break}catch{}}}if(!games.length){try{games=normalize(await json('./offline.json'))}catch{games=[]}}write(games);return games}
  window.ArcData={load,clearCache:()=>localStorage.removeItem(CACHE)};
})();
