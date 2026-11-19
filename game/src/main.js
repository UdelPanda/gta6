// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between six screens: title, play, paused, busted, wasted and complete.
//
// ?seed=N fixes the city and the traffic. ?shot=cover|chase|mission|foot (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.

import { CAMERA, MONEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createEntities } from './entities.js';
import { createPolice } from './police.js';
import { createPlayer } from './player.js';
import { createMissions } from './missions.js';
import { createRenderer } from './render.js';
import { loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const INTRO_SECONDS = 7;
const SPAWN = { x: 660, y: 1380 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261119;

const canvas = document.getElementById('game');
const status = document.getElementById('status');

function createGame() {
  const random = createRandom(seed);
  const city = createCity(random);
  const entities = createEntities(random, city);
  const police = createPolice(random, city);
  const audio = createAudio();
  const player = createPlayer(city, entities, police, audio);
  const missions = createMissions(city, police);
  const renderer = createRenderer(canvas, city);
  const save = loadSave();
  const camera = {
    x: SPAWN.x, y: SPAWN.y, zoom: CAMERA.footZoom, viewW: 1280, viewH: 800,
  };
  const game = {
    city, entities, police, player, missions, audio, renderer, save,
    camera, time: 0, effects: [], toasts: [], intro: null, introTimer: 0,
    screen: 'title', lostCash: 0, missionsDone: 0, stoleThisMission: false,
    lastGunshot: null, bestCash: save ? save.bestCash : 0,
  };
  player.reset(SPAWN);
  return game;
}

function toast(game, text, good = false, life = 4) {
  game.toasts.push({ text, good, life });
  if (game.toasts.length > 4) game.toasts.shift();
}

function persist(game) {
  const save = {
    cash: Math.floor(game.player.state.cash),
    missionIndex: Math.min(game.missions.missionIndex, game.missions.total - 1),
    hasPistol: game.player.state.hasPistol,
    missionsDone: game.missionsDone,
    bestCash: Math.max(game.bestCash, Math.floor(game.player.state.cash)),
  };
  game.bestCash = save.bestCash;
  writeSave(save);
  game.save = save;
}

function respawn(game, place) {
  const landmark = game.city.landmarks[place];
  const at = landmark ? { x: landmark.x, y: landmark.y + 60 } : SPAWN;
  game.player.reset(at);
  game.police.clearHeat();
  game.missions.load(game.missions.missionIndex);
  game.camera.x = at.x;
  game.camera.y = at.y;
}

function handlePlayerEvents(game) {
  const { player, police } = game;
  for (const event of player.events.splice(0)) {
    if (event.type === 'steal-witnessed' || event.type === 'steal-quiet') {
      game.stoleThisMission = true;
      toast(game, event.type === 'steal-witnessed' ? 'Stolen! Someone saw that.' : 'Clean lift — nobody saw a thing.', event.type === 'steal-quiet');
    } else if (event.type === 'pickup-cash') {
      toast(game, `Found $${event.amount} on the street.`, true);
    } else if (event.type === 'pickup-ammo') {
      toast(game, `Picked up ${event.amount} rounds.`, true);
    } else if (event.type === 'ped-run-over') {
      toast(game, 'You ran someone over! The heat is on.');
    } else if (event.type === 'ped-punched') {
      toast(game, 'You knocked a pedestrian flat.');
    } else if (event.type === 'cop-punched') {
      toast(game, 'You dropped a cop. That will cost you.');
    } else if (event.type === 'dry-fire') {
      toast(game, 'Magazine empty — press R to reload.');
    } else if (event.type === 'gunshot') {
      game.lastGunshot = { x: event.x, y: event.y };
    } else if (event.type === 'wasted') {
      const lost = Math.floor(player.state.cash * 0.2);
      player.state.cash -= lost;
      game.lostCash = lost;
      game.audio.busted();
      game.screen = 'wasted';
      persist(game);
      respawn(game, 'hospital');
    }
  }
}

function handlePoliceEvents(game) {
  for (const event of game.police.events.splice(0)) {
    if (event.type === 'wanted-up') {
      toast(game, `WANTED — ${event.level} star${event.level === 1 ? '' : 's'}. Lose them!`);
    } else if (event.type === 'wanted-down') {
      toast(game, event.level === 0 ? 'You lost them. The heat is off.' : `Heat dropping — ${event.level} star${event.level === 1 ? '' : 's'} left.`, true);
    } else if (event.type === 'cop-down') {
      toast(game, 'A cop is down. The city will remember that.');
    } else if (event.type === 'ram') {
      game.audio.crash();
    } else if (event.type === 'shot-player') {
      game.player.damage(event.damage);
    } else if (event.type === 'busted') {
      const lost = Math.floor(game.player.state.cash * 0.25);
      game.player.state.cash -= lost;
      game.lostCash = lost;
      game.audio.busted();
      game.screen = 'busted';
      persist(game);
      respawn(game, 'station');
    }
  }
}

function handleMissionEvents(game) {
  for (const event of game.missions.events.splice(0)) {
    if (event.type === 'mission-done') {
      game.player.addCash(event.reward);
      game.missionsDone += 1;
      game.audio.missionDone();
      toast(game, `Mission complete — $${event.reward.toLocaleString('en-US')} earned.`, true, 5);
      if (event.mission.id === 'borrowed-wheels') {
        game.player.givePistol();
        toast(game, 'Big Al slipped you a pistol. Mouse to aim, click to shoot.', true, 5);
      }
      persist(game);
      if (game.missions.done) {
        game.screen = 'complete';
        persist(game);
      }
    }
  }
}

/** One fixed step of the world, driven by any input (live or scripted). */
function stepGame(game, input) {
  const { player, entities, police, missions, camera, audio } = game;
  game.time += STEP;
  const gunshot = game.lastGunshot;
  game.lastGunshot = null;
  player.update(STEP, input, camera, game.effects);
  entities.update(STEP, {
    x: player.x, y: player.y, inCar: player.inCar,
    carX: player.carX, carY: player.carY, carSpeed: player.carSpeed,
  }, gunshot);
  police.update(STEP, {
    x: player.x, y: player.y, inCar: player.inCar,
    carX: player.carX, carY: player.carY, carSpeed: player.carSpeed,
    pushCar: (dx, dy) => player.pushCar(dx, dy),
    rammed: () => player.rammed(),
  }, game.effects);
  missions.update(STEP, {
    x: player.x, y: player.y, inCar: player.inCar,
    wanted: police.wanted, stoleThisMission: game.stoleThisMission,
  });
  handlePlayerEvents(game);
  handlePoliceEvents(game);
  handleMissionEvents(game);
  // Effects age out; toasts fade.
  for (let i = game.effects.length - 1; i >= 0; i -= 1) {
    game.effects[i].t += STEP;
    if (game.effects[i].t >= game.effects[i].life) game.effects.splice(i, 1);
  }
  for (let i = game.toasts.length - 1; i >= 0; i -= 1) {
    game.toasts[i].life -= STEP;
    if (game.toasts[i].life <= 0) game.toasts.splice(i, 1);
  }
  if (game.introTimer > 0) {
    game.introTimer -= STEP;
    if (game.introTimer <= 0) game.intro = null;
  }
  // The camera follows the player and pulls back at speed.
  const targetZoom = player.inCar ? CAMERA.carZoom : CAMERA.footZoom;
  camera.zoom += (targetZoom - camera.zoom) * Math.min(1, STEP * 2);
  const k = 1 - Math.exp(-CAMERA.lerp * STEP);
  camera.x += (player.x - camera.x) * k;
  camera.y += (player.y - camera.y) * k;
  // Sound follows the world.
  audio.engine(player.inCar ? Math.abs(player.carSpeed) / 520 : 0);
  audio.siren(police.sirenLevel({ x: player.x, y: player.y }));
}

/** The view the renderer reads: one object, rebuilt every frame. */
function buildView(game) {
  const step = game.missions.step();
  const target = game.missions.objectiveTarget();
  let hint = 'WASD move · Shift sprint · E steal car · F punch · Mouse aim, click shoot';
  if (game.player.inCar) hint = 'WASD drive · E get out · P pause · M mute';
  else if (game.entities.stealableAt(game.player.x, game.player.y, 78)) hint = 'Press E to steal this car';
  else if (game.player.state.hasPistol) hint = 'WASD move · E steal car · F punch · Click to shoot · R reload';
  return {
    cam: game.camera,
    time: game.time,
    player: game.player,
    entities: game.entities,
    police: game.police,
    missions: game.missions,
    effects: game.effects,
    toasts: game.toasts,
    intro: game.intro,
    save: game.save,
    lostCash: game.lostCash,
    missionTarget: target,
    stepText: step ? step.text : '',
    objectiveDistance: null,
    hint,
    losingCue: game.police.losingCue(),
  };
}

function runShot(name) {
  const game = createGame();
  game.screen = 'play';
  // Start a little into the story so the HUD shows a mission, not the title.
  game.missions.load(0);
  const scene = stageShot(name, game, (input) => stepGame(game, input));
  void scene;
  let painted = 0;
  function paint() {
    game.renderer.draw(buildView(game), 'play');
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const game = createGame();
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame(continueSave) {
    if (continueSave && game.save) {
      game.player.state.cash = game.save.cash;
      if (game.save.hasPistol) game.player.givePistol();
      game.missionsDone = game.save.missionsDone;
      game.missions.load(game.save.missionIndex);
    } else {
      game.missions.load(0);
    }
    game.screen = 'play';
    game.audio.unlock();
    const intro = game.missions.intro();
    if (intro) {
      game.intro = intro;
      game.introTimer = INTRO_SECONDS;
    }
    announce('Playing Solstice City. Follow the objective marker.');
  }

  function handleActions() {
    // Only the menu's own bits are taken here; E/F/R stay queued for the player.
    const actions = input.takeActions(ACTION_MUTE | ACTION_PAUSE | ACTION_CONFIRM);
    if (actions & ACTION_MUTE) {
      game.audio.setMuted(!game.audio.isMuted());
      toast(game, game.audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (game.screen === 'title' && (actions & ACTION_CONFIRM)) {
      startGame(!!game.save);
    } else if ((game.screen === 'busted' || game.screen === 'wasted' || game.screen === 'complete') && (actions & ACTION_CONFIRM)) {
      if (game.screen === 'complete') {
        game.screen = 'title';
      } else {
        game.screen = 'play';
        const intro = game.missions.intro();
        if (intro) {
          game.intro = intro;
          game.introTimer = INTRO_SECONDS;
        }
      }
      announce('Playing.');
    } else if (actions & ACTION_PAUSE && game.screen === 'play') {
      game.screen = 'paused';
      persist(game);
      announce('Paused. Progress saved.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && game.screen === 'paused') {
      game.screen = 'play';
      announce('Playing.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (game.screen === 'play') {
      while (accumulator >= STEP) {
        stepGame(game, input);
        accumulator -= STEP;
      }
      // A fresh mission shows its intro card once.
      if (!game.intro && game.introTimer <= 0) {
        const intro = game.missions.intro();
        if (intro) {
          game.intro = intro;
          game.introTimer = INTRO_SECONDS;
        }
      }
    } else {
      accumulator = 0;
    }
    game.renderer.draw(buildView(game), game.screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === 'play') {
      game.screen = 'paused';
      persist(game);
      announce('Paused.');
    }
  });

  announce('Solstice City. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
