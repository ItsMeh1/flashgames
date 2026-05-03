// Fetch and transform gn-math games
async function getGnMathGames() {
  let allGames = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await fetch(
        `https://data.jsdelivr.com/v1/stats/packages/gh/gn-math/html@main/files?period=year&page=${page}`
      );
      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        hasMore = false;
        break;
      }
      
      const games = data.filter(file => file.name.endsWith('.html'));
      allGames = allGames.concat(games);
      
      page++;
    } catch (error) {
      console.error('Error fetching gn-math games:', error);
      hasMore = false;
    }
  }

  // Transform to match your format
  return allGames.map(game => {
    const gameNumber = game.name.replace(/\.html|\/|-\w+/g, ''); // Extract number from filename
    
    return {
      title: `GN-Math Problem ${gameNumber}`,
      name: game.name,
      image: 'https://via.placeholder.com/300x180/1a5490/ffffff?text=GN-Math',
      embed: `https://raw.githubusercontent.com/gn-math/html/main${game.name}`, // Changed to GitHub raw URL
      tags: `math, problem, gn-math, #${gameNumber}`,
      description: `Hits: ${game.hits.total} | Bandwidth: ${(game.bandwidth.total / 1024 / 1024).toFixed(2)}MB`,
    };
  });
}

// Add to gameLibraries
(async () => {
  const gnMathGames = await getGnMathGames();
  gameLibraries['GN-Math'] = gnMathGames;
  
  if (typeof init === 'function') {
    init();
  }
})();
