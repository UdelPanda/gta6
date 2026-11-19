// The screenshot scenes behind ?shot=cover|chase|mission|foot. Each one plays
// the real rules forward from a fresh game for a fixed number of steps, steered
// by a small autopilot (drive toward a target, shoot at the nearest cop), so
// the frame is what real play looks like and the same seed always gives the
// same frame. The caller passes a step function that advances the game one
// fixed step with a synthetic input.

import { STEP, WANTED } from './config.js';
import { onRoad } from './city.js';
import { angleDelta, clamp } from './random.js';

const SHOT_SECONDS = {
  cover: 9,
  chase: 7,
  // 5 s: the car is driving up to the Hideout at speed. Longer, and it
  // arrives, noses into the Hideout's corner just outside the delivery
  // radius, and sits there at 0 mph while the police close in.
  mission: 5,
  foot: 5,
};

/** An input object the autopilot steers, matching the live input's shape. */
function scriptedInput() {
  const state = { x: 0, y: 0, shoot: false, aim: 0 };
  return {
    set(x, y, shoot, aim) {
      state.x = x;
      state.y = y;
      state.shoot = shoot;
      state.aim = aim;
    },
    moveX() {
      return state.x;
    },
    moveY() {
      return state.y;
    },
    sprint() {
      return false;
    },
    takeActions() {
      return 0;
    },
    shooting() {
      return state.shoot;
    },
    aimAngle() {
      return state.aim;
    },
  };
}

/** Put the player in the nearest car, quietly (no wanted heat for the shot). */
function putPlayerInCar(game) {
  const { player, entities } = game;
  const car = entities.stealableAt(player.state.x, player.state.y, 600)
    || entities.traffic.find((c) => !c.parked)
    || entities.traffic[0];
  if (!car) return null;
  entities.takeCar(car);
  player.state.inCar = true;
  player.state.car = {
    x: car.x, y: car.y, angle: car.angle, speed: 0,
    color: car.color, kind: car.kind, length: car.length, width: car.width,
  };
  player.state.x = car.x;
  player.state.y = car.y;
  return player.state.car;
}

/** The nearest car directly ahead, within rangePx, or null. Parked cars count:
 * the autopilot must steer around them, not rear-end them at full speed.
 * A moving car only counts when it is going the same way — swerving at
 * oncoming traffic would steer the player straight into it. */
function carAheadOf(game, car, rangePx) {
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  for (const other of game.entities.traffic) {
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * hx + dy * hy;
    const side = Math.abs(-dx * hy + dy * hx);
    if (along <= 0 || along >= rangePx || side >= 55) continue;
    if (!other.parked && Math.cos(other.angle - car.angle) < 0.5) continue;
    return other;
  }
  return null;
}

/**
 * Grid routing: if the target is not on the car's street, aim at the nearest
 * intersection on the way there, so the car drives along streets instead of
 * cutting diagonally across blocks (and into the buildings at their edges).
 */
function routeTarget(game, car, tx, ty) {
  const streetY = Math.round(car.y / 600) * 600;
  const streetX = Math.round(car.x / 600) * 600;
  const onH = Math.abs(car.y - streetY) < 48;
  const onV = Math.abs(car.x - streetX) < 48;
  if (!onH && !onV) {
    // Off the road (a forecourt, a park): if the target is close, drive
    // straight at it — that is the final approach to a place inside a block.
    // Otherwise get to the nearest intersection first instead of cutting
    // diagonally through blocks.
    if (Math.hypot(tx - car.x, ty - car.y) < 350) return { x: tx, y: ty };
    return { x: streetX, y: streetY };
  }
  if (onH && Math.abs(ty - streetY) > 120) {
    if (Math.abs(ty - streetY) <= 320) {
      // Target is just off this street: drive to its x, then turn straight
      // in — the landmark sits just past the kerb, so the approach is clear.
      if (Math.abs(car.x - tx) > 80) return { x: tx, y: streetY };
    } else {
      const avenue = Math.round(tx / 600) * 600;
      if (Math.abs(car.x - avenue) > 80) return { x: avenue, y: streetY };
    }
  }
  if (onV && Math.abs(tx - streetX) > 120) {
    if (Math.abs(tx - streetX) <= 320) {
      if (Math.abs(car.y - ty) > 80) return { x: streetX, y: ty };
    } else {
      const street = Math.round(ty / 600) * 600;
      if (Math.abs(car.y - street) > 80) return { x: streetX, y: street };
    }
  }
  return { x: tx, y: ty };
}

/**
 * Drive toward (tx, ty): full throttle, steering at the target. When a slower
 * car blocks the lane, swing into the oncoming lane to overtake it, then
 * drift back. `st` carries the overtake state between steps.
 */
function driveToward(input, game, tx, ty, st) {
  const car = game.player.state.car;
  if (!car) {
    input.set(0, 0, false, 0);
    return;
  }
  const route = routeTarget(game, car, tx, ty);
  const desired = Math.atan2(route.y - car.y, route.x - car.x);
  if (carAheadOf(game, car, 220)) st.overtake = 1;
  else if (st.overtake > 0) st.overtake = Math.max(0, st.overtake - 0.02);
  // Aim 350 px ahead along the route.
  let ax = car.x + Math.cos(desired) * 350;
  let ay = car.y + Math.sin(desired) * 350;
  const onRd = onRoad(game.city, car.x, car.y);
  const streetY = Math.round(car.y / 600) * 600;
  const streetX = Math.round(car.x / 600) * 600;
  // Near a road but off it (the final approach to a place inside a block):
  // aim straight at the target instead of being dragged back to the street.
  const nearRoad = Math.abs(car.y - streetY) < 120 || Math.abs(car.x - streetX) < 120;
  if (!onRd && !nearRoad) {
    // Deep in a block: steer back to the nearest street first.
    const nearestStreet = streetY;
    const nearestAvenue = streetX;
    if (Math.abs(Math.cos(desired)) >= Math.abs(Math.sin(desired))) {
      ax = car.x + Math.cos(desired) * 400;
      ay = nearestStreet;
    } else {
      ax = nearestAvenue;
      ay = car.y + Math.sin(desired) * 400;
    }
  } else if (st.overtake > 0 && onRd) {
    // Overtake into the oncoming lane: 18 px left of the street centreline.
    // The shift is measured from where the car already is, so a car in the
    // driving lane moves ~36 px and a car on the centreline ~18 px — never
    // far enough to clip the buildings at the road's edge.
    const lx = Math.sin(desired);
    const ly = -Math.cos(desired);
    const horizontal = Math.abs(Math.cos(desired)) >= Math.abs(Math.sin(desired));
    const sx = horizontal ? car.x : streetX;
    const sy = horizontal ? streetY : car.y;
    const lat = (car.x - sx) * lx + (car.y - sy) * ly;
    const shift = clamp(18 - lat, -60, 60) * st.overtake;
    ax += lx * shift;
    ay += ly * shift;
  } else if (onRd) {
    // Cruise in the right-hand lane — but only while driving along the street
    // the car is on. Turning off the street (the final approach to a place
    // inside a block) aims straight at the target instead.
    const onH = Math.abs(car.y - streetY) < 48;
    const onV = Math.abs(car.x - streetX) < 48;
    const horizontal = Math.abs(Math.cos(desired)) >= Math.abs(Math.sin(desired));
    if (onH && horizontal) {
      ay = streetY + Math.cos(desired) * 18;
    } else if (onV && !horizontal) {
      ax = streetX - Math.sin(desired) * 18;
    }
  }
  const aim = Math.atan2(ay - car.y, ax - car.x);
  const turn = angleDelta(car.angle, aim);
  input.set(clamp(turn * 2.2, -1, 1), -1, false, aim);
}

/**
 * Set `game` to the named scene and return the screen to draw over it.
 * `stepGame` advances the game one fixed step with the given input.
 */
export function stageShot(name, game, stepGame) {
  const input = scriptedInput();
  const drive = { overtake: 0 };
  const { player, entities, police, missions, city } = game;
  const seconds = SHOT_SECONDS[name] || SHOT_SECONDS.cover;
  const steps = Math.floor(seconds / STEP);

  if (name === 'foot') {
    // On foot outside the casino, pistol out, the law closing in.
    const casino = city.landmarks.casino;
    player.state.x = casino.x - 40;
    player.state.y = casino.y + 150;
    player.state.angle = -Math.PI / 2;
    player.givePistol();
    player.state.mag = 12;
    player.state.ammo = 48;
    police.setHeat(WANTED.thresholds[2]);
    for (let i = 0; i < steps; i += 1) {
      const cop = police.units[0];
      const aim = cop ? Math.atan2(cop.y - player.state.y, cop.x - player.state.x) : -Math.PI / 2;
      // One shot every two seconds: three shots in the scene, two cops down,
      // and the heat lands at 4 stars (160 + 3×60 + 2×200 = 740) — the frame
      // the screenshot shows. Firing every window (10 shots) kills three
      // cops and pushes the heat to 5 stars.
      input.set(0, 0, i % 120 < 12, aim);
      stepGame(input);
    }
    return { screen: 'play' };
  }

  if (name === 'chase') {
    // Three stars, three police cars, one very fast getaway down the avenue.
    player.state.x = 900;
    player.state.y = 1200;
    const car = putPlayerInCar(game);
    if (car) {
      car.angle = 0;
      car.x = 900;
      car.y = 1200;
    }
    police.setHeat(WANTED.thresholds[3]);
    for (let i = 0; i < steps; i += 1) {
      driveToward(input, game, 4200, 1200, drive);
      stepGame(input);
    }
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // Mission 3, Hot Cargo: the package is in, the docks are behind, the
    // hideout is ahead and two stars are already on the tail.
    missions.load(2);
    const docks = city.landmarks.docks;
    player.state.x = docks.x;
    player.state.y = docks.y + 60;
    const car = putPlayerInCar(game);
    if (car) {
      car.angle = Math.PI / 2;
      car.x = docks.x;
      car.y = docks.y + 60;
    }
    const hideout = city.landmarks.hideout;
    for (let i = 0; i < steps; i += 1) {
      driveToward(input, game, hideout.x, hideout.y, drive);
      stepGame(input);
    }
    return { screen: 'play' };
  }

  // cover: a calm cruise down the avenue in traffic, the city showing off.
  player.state.x = 300;
  player.state.y = 1200;
  const car = putPlayerInCar(game);
  if (car) {
    car.angle = 0;
    car.x = 300;
    car.y = 1200;
  }
  for (let i = 0; i < steps; i += 1) {
    driveToward(input, game, 4300, 1200, drive);
    stepGame(input);
  }
  return { screen: 'play' };
}
