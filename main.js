// main.js

const librarySelect = document.getElementById("library-select");
const searchInput = document.getElementById("search-input");
const gameGrid = document.getElementById("game-grid");

const homePage = document.getElementById("home-page");
const gamePage = document.getElementById("game-page");
const gameIframe = document.getElementById("game-iframe");
const backBtn = document.getElementById("back-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");

let currentLibrary = "";

function init() {
    // Populate Dropdown
    const libraryNames = Object.keys(gameLibraries);
    libraryNames.forEach(lib => {
        const option = document.createElement("option");
        option.value = lib;
        option.textContent = lib;
        librarySelect.appendChild(option);
    });

    if (libraryNames.length > 0) {
        currentLibrary = libraryNames[0];
        renderGames();
    }

    // Listeners
    librarySelect.addEventListener("change", (e) => {
        currentLibrary = e.target.value;
        // Optional: clear search when switching libraries
        // searchInput.value = ""; 
        renderGames();
    });

    searchInput.addEventListener("input", renderGames);
    backBtn.addEventListener("click", closeGame);
    fullscreenBtn.addEventListener("click", toggleFullscreen);
}

function renderGames() {
    gameGrid.innerHTML = "";
    const query = searchInput.value.toLowerCase();
    const games = gameLibraries[currentLibrary] || [];

    const filteredGames = games.filter(game => 
        game.name.toLowerCase().includes(query) || 
        game.description.toLowerCase().includes(query)
    );

    // Empty State Handling
    if (filteredGames.length === 0) {
        gameGrid.innerHTML = `<div class="empty-state">No games found matching "${searchInput.value}" in ${currentLibrary}.</div>`;
        return;
    }

    // Create Cards
    filteredGames.forEach(game => {
        const card = document.createElement("div");
        card.className = "game-card";
        card.onclick = () => openGame(game.gameUrl);

        card.innerHTML = `<img src="${game.imageUrl}" alt="${game.name}" loading="lazy">`;
        gameGrid.appendChild(card);
    });
}

function openGame(url) {
    // Fade out home, fade in game
    homePage.classList.add("hidden");
    
    // Give it a tiny delay to ensure the display property handles the transition
    setTimeout(() => {
        gameIframe.src = url;
        gamePage.classList.remove("hidden");
    }, 100); 
}

function closeGame() {
    // Fade out game, fade in home
    gamePage.classList.add("hidden");
    
    setTimeout(() => {
        homePage.classList.remove("hidden");
        gameIframe.src = ""; 
    }, 300); // Wait for fade out to finish before wiping iframe
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        gamePage.requestFullscreen().catch(err => {
            console.error(`Error enabling fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

init();
