(() => {
  'use strict';

  const themes = [
    ['dark', '#8b5cf6'],
    ['aurora', '#22d3ee'],
    ['ocean', '#38bdf8'],
    ['rose', '#fb7185'],
    ['graphite', '#b6bbc5'],
    ['light', '#f59e0b']
  ];

  document.addEventListener('DOMContentLoaded', () => {
    const choices = document.getElementById('themeChoices');
    if (!choices) return;
    choices.innerHTML = themes.map(([name, color]) => `<button data-theme="${name}" title="${name[0].toUpperCase()}${name.slice(1)}">${name[0].toUpperCase()}${name.slice(1)}</button>`).join('');
  }, { once: true });
})();
