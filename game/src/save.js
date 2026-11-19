// Saving: one localStorage key holds cash, mission progress, the pistol and
// the best run. Saving never blocks the game: a bad or missing save just
// means a fresh start.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save !== 'object' || save === null) return null;
    return {
      cash: typeof save.cash === 'number' ? save.cash : 80,
      missionIndex: typeof save.missionIndex === 'number' ? save.missionIndex : 0,
      hasPistol: save.hasPistol === true,
      missionsDone: typeof save.missionsDone === 'number' ? save.missionsDone : 0,
      bestCash: typeof save.bestCash === 'number' ? save.bestCash : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage off: nothing to clear.
  }
}
