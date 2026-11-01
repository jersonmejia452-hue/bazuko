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
  // Los materiales de calle ya son los de todos: ?aspecto=realista queda para no caer en el modelo liviano guardado.
  const modeloRealista = new URLSearchParams(location.search).get('aspecto') === 'realista';
  const game = new Game(document.getElementById('game-canvas'), { animaciones, modeloRealista });
  await game.start(loading);
  startControlsHelp();
  openDeveloperNote(game);
} catch (error) { loading.error(error); }
