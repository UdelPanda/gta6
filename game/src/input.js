// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (interact, punch, reload, pause, mute) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost or counted twice.
// The mouse gives the aim direction in world space, through the camera.

export const ACTION_INTERACT = 1;
export const ACTION_PUNCH = 2;
export const ACTION_RELOAD = 4;
export const ACTION_PAUSE = 8;
export const ACTION_CONFIRM = 16;
export const ACTION_MUTE = 32;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseSeen = false;

  function press(action, event) {
    if (!event.repeat) actions |= action;
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE') press(ACTION_INTERACT, event);
    else if (event.code === 'KeyF') press(ACTION_PUNCH, event);
    else if (event.code === 'KeyR') press(ACTION_RELOAD, event);
    else if (event.code === 'KeyP' || event.code === 'Escape') press(ACTION_PAUSE, event);
    else if (event.code === 'Enter' || event.code === 'Space') press(ACTION_CONFIRM, event);
    else if (event.code === 'KeyM') press(ACTION_MUTE, event);
    else if (!UP.has(event.code) && !DOWN.has(event.code) && !LEFT.has(event.code) && !RIGHT.has(event.code)) return;
    keys.add(event.code);
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseSeen = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseSeen = true;
    if (event.button === 0) mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function held(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  return {
    /** -1/0/1 on each axis, from WASD or the arrow keys. */
    moveX() {
      return (held(RIGHT) ? 1 : 0) - (held(LEFT) ? 1 : 0);
    },
    moveY() {
      return (held(DOWN) ? 1 : 0) - (held(UP) ? 1 : 0);
    },
    sprint() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    /** One-shot presses since the last call, as ACTION_* flags. With a mask,
     * only those bits are taken; the rest stay queued for the next caller, so
     * the menu and the player never eat each other's presses. */
    takeActions(mask = 0xffff) {
      const taken = actions & mask;
      actions &= ~mask;
      return taken;
    },
    /** True while the left mouse button is held (hold to keep shooting). */
    shooting() {
      return mouseDown;
    },
    /** Aim angle in world space from (x, y), through the camera. */
    aimAngle(x, y, camera) {
      if (!mouseSeen) return 0;
      const wx = camera.x + (mouseX - camera.viewW / 2) / camera.zoom;
      const wy = camera.y + (mouseY - camera.viewH / 2) / camera.zoom;
      return Math.atan2(wy - y, wx - x);
    },
  };
}
