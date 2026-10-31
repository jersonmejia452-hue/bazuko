import '@fontsource/overpass/600.css';
import '@fontsource/overpass/400.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/overpass/800.css';
import '@fontsource/overpass/900.css';
import { LoadingScreen } from './ui/LoadingScreen.js';
import { startControlsHelp } from './ui/ControlsHelp.js';
import { openDeveloperNote } from './ui/DeveloperNote.js';

const loading = new LoadingScreen();
try {
  await loading.stage('Preparando el juego…', 0);
  const { Game } = await import('./core/game.js');
  const animaciones = new URLSearchParams(location.search).get('animaciones') === 'mixamo-preview'
    ? 'mixamo-game-preview' : 'default';
  const apariencia = new URLSearchParams(location.search).get('aspecto') === 'realista' ? 'street-preview' : 'default';
  const game = new Game(document.getElementById('game-canvas'), { animaciones, apariencia });
  await game.start(loading);
  startControlsHelp();
  openDeveloperNote(game);
} catch (error) { loading.error(error); }
