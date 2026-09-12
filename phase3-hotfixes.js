(() => {
  'use strict';

  const waitFor = (check, timeout = 10000) => new Promise((resolve) => {
    const started = Date.now();
    const tick = () => { try { const value = check(); if (value) return resolve(value); } catch (_) {} if (Date.now() - started >= timeout) return resolve(null); setTimeout(tick, 100); };
    tick();
  });

  function installCloudProviders() {
    const existing = Array.isArray(window.FlashCloudGames) ? window.FlashCloudGames : [];
    const providers = [
      { id:'raccoon-cloud-games', name:'Raccoon Cloud Games', url:'https://www.raccoongame.com/', cover:'./offline/logo.png', description:'Cloud gaming through Raccoon Game. Open the provider and choose a cloud title to start streaming.' },
      { id:'yom-cloud-games', name:'YOM Instant Cloud Games', url:'https://yom.net/demo/', cover:'./offline/logo.png', description:'Browser-streamed cloud game demos with no local game download.' }
    ];
    const seen = new Set(existing.map((game) => String(game?.id || game?.url || '')));
    window.FlashCloudGames = [...existing, ...providers.filter((game) => !seen.has(game.id))];
  }

  function addPlayerLoader() {
    const overlay = document.getElementById('playerOverlay');
    const frame = document.getElementById('gameFrame');
    if (!overlay || !frame) return false;
    if (overlay.dataset.phase3Loader) return true;
    overlay.dataset.phase3Loader = '1';
    const loader = document.createElement('div');
    loader.dataset.phase3GameLoader = '1';
    loader.innerHTML = '<div class="phase3-game-spinner" aria-hidden="true"></div><strong>Loading game...</strong><span>Please wait while the game starts.</span>';
    Object.assign(loader.style,{position:'absolute',inset:'0',zIndex:'5',display:'none',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'8px',padding:'24px',textAlign:'center',pointerEvents:'none',background:'rgba(8,8,12,.78)',backdropFilter:'blur(14px)',color:'white'});
    loader.querySelector('strong').style.fontSize='18px'; loader.querySelector('span').style.opacity='.68';
    Object.assign(loader.querySelector('.phase3-game-spinner').style,{width:'28px',height:'28px',border:'2px solid rgba(255,255,255,.22)',borderTopColor:'currentColor',borderRadius:'50%',animation:'phase3Spin .8s linear infinite'});
    overlay.appendChild(loader);
    if(!document.getElementById('phase3-loader-style')){const style=document.createElement('style');style.id='phase3-loader-style';style.textContent='@keyframes phase3Spin{to{transform:rotate(360deg)}}';document.head.appendChild(style);}
    const show=()=>{loader.style.display='flex';}; const hide=()=>{loader.style.display='none';};
    frame.addEventListener('load',()=>setTimeout(hide,120),{passive:true});
    const observer=new MutationObserver(()=>{if(!overlay.hidden&&frame.getAttribute('src')&&frame.getAttribute('src')!=='about:blank')show();if(overlay.hidden)hide();});
    observer.observe(overlay,{attributes:true,attributeFilter:['hidden']});
    observer.observe(frame,{attributes:true,attributeFilter:['src']});
    window.FlashGameLoader={show,hide};
    return true;
  }

  async function stabilizeDownloads() {
    const store=await waitFor(()=>window.FlashGamesStore,12000);
    if(!store||typeof store.install!=='function'||store.install.__phase3Wrapped)return;
    const original=store.install.bind(store);
    const wrapped=async(game)=>{
      const candidates=[...new Set([game?.rawUrl,game?.url,game?.href,game?.link].map(v=>String(v||'').trim()).filter(v=>/^https?:\/\//i.test(v)))];
      if(!candidates.length)return original(game);
      let lastError=null;
      for(const sourceUrl of candidates){try{return await original({...game,rawUrl:sourceUrl,url:sourceUrl});}catch(error){lastError=error;if(!/404|not found|download failed/i.test(String(error?.message||'')))throw error;}}
      throw lastError||new Error('The game source could not be downloaded.');
    };
    wrapped.__phase3Wrapped=true; store.install=wrapped;
  }

  function boot(){installCloudProviders();addPlayerLoader();stabilizeDownloads();new MutationObserver(()=>addPlayerLoader()).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
