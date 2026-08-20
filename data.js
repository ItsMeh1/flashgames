(() => {
  'use strict';
  const CACHE='arc.games.cache.v3';
  const TTL=5*60*1000;
  const normalize=(items)=>Array.isArray(items)?items.filter(Boolean).map((g,i)=>({id:String(g.id??g.slug??g.name??`game-${i}`),name:String(g.name??g.title??'Untitled game'),category:String(g.category??g.genre??'Games'),zone:String(g.zone??g.type??'OFFLINE'),url:String(g.url??g.launchUrl??''),cover:String(g.cover??g.thumbnail??g.image??''),description:String(g.description??'Ready to play.'),tags:Array.isArray(g.tags)?g.tags.map(String):[]})).filter(g=>g.url):[];
  const builtIn=Array.isArray(window.ARC_GAMES)?normalize(window.ARC_GAMES):[];
  async function json(url){const c=new AbortController();const t=setTimeout(()=>c.abort(),7000);try{const r=await fetch(url,{signal:c.signal,cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json()}finally{clearTimeout(t)}}
  function cacheRead(){try{const x=JSON.parse(localStorage.getItem(CACHE)||'null');return x&&Date.now()-x.time<TTL?normalize(x.games):null}catch{return null}}
  function cacheWrite(games){try{localStorage.setItem(CACHE,JSON.stringify({time:Date.now(),games}))}catch{}}
  async function load(force=false){if(!force){const cached=cacheRead();if(cached?.length)return {games:cached,source:'cache'}}const configured=(localStorage.getItem('arc.api')||window.ARC_API_BASE||'').replace(/\/$/,'');if(configured){for(const u of [`${configured}/games.json`,`${configured}/api/games`,configured]){try{const games=normalize(await json(u));if(games.length){cacheWrite(games);return {games,source:'api'}}}catch{}}}try{const games=normalize(await json('./offline.json'));cacheWrite(games);return {games,source:'offline'}}catch{cacheWrite(builtIn);return {games:builtIn,source:'embedded'}}}
  window.ArcData={load,clearCache:()=>localStorage.removeItem(CACHE)};
})();
