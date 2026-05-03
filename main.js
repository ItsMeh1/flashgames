const grid = document.getElementById('grid');
const libList = document.getElementById('lib-list');
const search = document.getElementById('search');
const overlay = document.getElementById('overlay');
const frame = document.getElementById('game-frame');

let currentLib = "";

function init() {
    const libs = Object.keys(gameLibraries);
    if (libs.length === 0) {
        grid.innerHTML = "<p style='color: gray;'>No libraries found. Check your list.js file!</p>";
        return;
    }

    // Build Sidebar
    libs.forEach((lib, index) => {
        const btn = document.createElement('button');
        btn.className = `lib-btn ${index === 0 ? 'active' : ''}`;
        btn.textContent = lib;
        btn.onclick = () => {
            document.querySelectorAll('.lib-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLib = lib;
            render();
        };
        libList.appendChild(btn);
    });

    currentLib = libs[0];
    render();

    search.oninput = render;
}

function render() {
    grid.innerHTML = '';
    const term = search.value.toLowerCase();
    const games = gameLibraries[currentLib] || [];

    games.forEach(rawGame => {
        const game = transformGame(rawGame);
        const title = game.title || game.name || "Untitled";
        const image = game.image || game.imageUrl;
        const url = game.embed || game.gameUrl;
        const desc = game.tags || game.description || "";
        
        // Check for the special note field (for first-party apps like Mobify)
        const noteHtml = game.note ? `<div class="card-note" style="font-size: 0.85em; color: #ffeb3b; margin-top: 5px; font-weight: bold;">⭐ ${game.note}</div>` : "";

        // smarter search (title + tags)
        if (
            !title.toLowerCase().includes(term) &&
            !desc.toLowerCase().includes(term)
        ) return;

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <img src="${image}" onerror="this.src='https://via.placeholder.com/300x180/1c1c21/ffffff?text=No+Image'">
            <div class="card-body">
                <div class="card-name">${title}</div>
                <div class="card-desc">${desc}</div>
                ${noteHtml}
            </div>
        `;

        card.onclick = () => openGame(url);
        grid.appendChild(card);
    });
}

function transformGame(game) {
    const suffix = "?.classroom.google.com";

    // Removed the 'enabled' requirement so it always applies
    function addSuffix(url) { 
        if (!url || !url.startsWith("http")) return url;
        if (url.includes(suffix)) return url;
        return url + suffix;
    }

    return {
        ...game,
        embed: addSuffix(game.embed),
        image: addSuffix(game.image)
    };
}

function openGame(url) {
    if (!url || !url.startsWith("http")) {
        alert("Invalid game URL");
        return;
    }

    overlay.style.display = 'block';
    frame.src = url;
}

function closeGame() {
    overlay.style.display = 'none';
    frame.src = 'about:blank'; // Clears the memory
}

function toggleFS() {
    if (!document.fullscreenElement) overlay.requestFullscreen();
    else document.exitFullscreen();
}

// Start
init();
