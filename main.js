// main.js

// DOM Elements
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
    // 1. Populate the Library Dropdown from list.js
    const libraryNames = Object.keys(gameLibraries);
    libraryNames.forEach(lib => {
        const option = document.createElement("option");
        option.value = lib;
        option.textContent = lib;
        librarySelect.appendChild(option);
    });

    // Set default library
    if (libraryNames.length > 0) {
        currentLibrary = libraryNames[0];
        renderGames();
    }

    // 2. Event Listeners
    librarySelect.addEventListener("change", (e) => {
        currentLibrary = e.target.value;
        renderGames();
    });

    searchInput.addEventListener("input", renderGames);

    backBtn.addEventListener("click", closeGame);
    fullscreenBtn.addEventListener("click", toggleFullscreen);
}

function renderGames() {
    // Clear current grid
    gameGrid.innerHTML = "";
    
    const query = searchInput.value.toLowerCase();
    const games = gameLibraries[currentLibrary] || [];

    // Filter by search bar
    const filteredGames = games.filter(game => 
        game.name.toLowerCase().includes(query) || 
        game.description.toLowerCase().includes(query)
    );

    // Create cards dynamically
    filteredGames.forEach(game => {
        const card = document.createElement("div");
        card.className = "game-card";
        card.onclick = () => openGame(game.gameUrl);

        card.innerHTML = `
            <img src="${game.imageUrl}" alt="${game.name}">
        `;
        
        // Note: I left out the text tags inside the card to match your 1st screenshot 
        // which heavily relies on the image for the game icon. 
        // If you want text below the image, you can add an h3 here.

        gameGrid.appendChild(card);
    });
}

function openGame(url) {
    homePage.style.display = "none";
    gamePage.style.display = "block";
    gameIframe.src = url; // Load the game
}

function closeGame() {
    homePage.style.display = "block";
    gamePage.style.display = "none";
    gameIframe.src = ""; // Clear iframe to stop game audio/processing in background
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        // Request fullscreen on the whole game page so sidebar is included (or just gameIframe if you prefer)
        gamePage.requestFullscreen().catch(err => {
            console.error(`Error enabling fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

// Boot up the page
init();
