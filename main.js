const grid = document.getElementById('game-grid');
const libSelect = document.getElementById('lib-select');
const searchBar = document.getElementById('search-bar');
const overlay = document.getElementById('game-overlay');
const frame = document.getElementById('game-frame');

function init() {
    // Fill Select
    Object.keys(gameLibraries).forEach(lib => {
        const opt = document.createElement('option');
        opt.value = lib;
        opt.textContent = lib;
        libSelect.appendChild(opt);
    });

    render(libSelect.value);

    libSelect.onchange = () => render(libSelect.value);
    searchBar.oninput = () => render(libSelect.value);
}

function render(library) {
    grid.innerHTML = '';
    const term = searchBar.value.toLowerCase();
    
    gameLibraries[library].forEach(game => {
        if (!game.name.toLowerCase().includes(term)) return;

        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
            <img src="${game.imageUrl}" alt="${game.name}">
            <div class="card-info">
                <p class="card-title">${game.name}</p>
                <p class="card-desc">${game.description}</p>
            </div>
        `;
        el.onclick = () => openGame(game.gameUrl);
        grid.appendChild(el);
    });
}

function openGame(url) {
    overlay.style.display = 'block';
    frame.src = url;
    
    // Troubleshooting help: Logs to console if the link is likely blocked
    console.log("Loading: " + url);
}

function closeGame() {
    overlay.style.display = 'none';
    frame.src = '';
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        overlay.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

init();
