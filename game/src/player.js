// Rico Vega: on foot and behind the wheel. Walking, sprinting, stealing cars,
// driving with real-ish car physics, punching and shooting. The player owns
// the bullets; police, traffic and pedestrians live in their own modules.

import { CAR, MONEY, PLAYER, WANTED } from './config.js';
import { clamp, distance } from './random.js';
import { clampToWorld, collideBuildings, hitsBuilding, onRoad, onSand } from './city.js';

function witnessed(entities, police, x, y) {
  if (police.sirenLevel({ x, y }) > 0.25) return true;
  for (const ped of entities.peds) {
    if (ped.state !== 'down' && distance(ped.x, ped.y, x, y) < 200) return true;
  }
  return false;
}

export function createPlayer(city, entities, police, audio) {
  const state = {
    x: 0, y: 0, angle: 0,
    health: PLAYER.health,
    cash: MONEY.start,
    ammo: 48,
    mag: PLAYER.pistolMag,
    inCar: false,
    car: null,
    hurt: 0,
    punchCooldown: 0,
    pistolCooldown: 0,
    reloadTimer: 0,
    hasPistol: false,
  };
  const bullets = [];
  const events = [];
  // Cars the player is currently touching: the impact speed cut applies once
  // per hit, not every frame, so a bump costs speed once and the car can
  // push past instead of grinding to a halt against the other car.
  let touching = new WeakSet();

  function reset(spawn) {
    state.x = spawn.x;
    state.y = spawn.y;
    state.angle = -Math.PI / 2;
    state.health = PLAYER.health;
    state.inCar = false;
    state.car = null;
    state.hurt = 0;
    state.punchCooldown = 0;
    state.pistolCooldown = 0;
    state.reloadTimer = 0;
    bullets.length = 0;
    touching = new WeakSet();
  }

  function carPoints(car) {
    const hx = Math.cos(car.angle);
    const hy = Math.sin(car.angle);
    return [
      { x: car.x + hx * 20, y: car.y + hy * 20 },
      { x: car.x - hx * 20, y: car.y - hy * 20 },
    ];
  }

  function damage(amount) {
    if (state.hurt > 0) return;
    state.health -= amount;
    state.hurt = 0.5;
    audio.punch();
    if (state.health <= 0) {
      state.health = 0;
      events.push({ type: 'wasted' });
    }
  }

  function shootPistol(angle, effects) {
    if (state.pistolCooldown > 0 || state.reloadTimer > 0) return;
    if (!state.hasPistol) return;
    if (state.mag <= 0) {
      events.push({ type: 'dry-fire' });
      state.pistolCooldown = 0.3;
      return;
    }
    state.mag -= 1;
    state.pistolCooldown = PLAYER.pistolCooldown;
    const mx = state.x + Math.cos(angle) * 20;
    const my = state.y + Math.sin(angle) * 20;
    bullets.push({ x: mx, y: my, angle, speed: 950, life: 0.9, damage: PLAYER.pistolDamage });
    effects.push({ type: 'muzzle', x: mx, y: my, angle, t: 0, life: 0.07 });
    audio.shot();
    events.push({ type: 'gunshot', x: state.x, y: state.y });
    police.addHeat(WANTED.shoot);
  }

  function punch(angle) {
    if (state.punchCooldown > 0) return;
    state.punchCooldown = PLAYER.punchCooldown;
    const tx = state.x + Math.cos(angle) * PLAYER.punchRange;
    const ty = state.y + Math.sin(angle) * PLAYER.punchRange;
    const ped = entities.pedAt(tx, ty, PLAYER.punchRange + 12);
    if (ped) {
      entities.knockDown(ped);
      police.addHeat(WANTED.hitPed);
      audio.punch();
      events.push({ type: 'ped-punched', x: ped.x, y: ped.y });
      return;
    }
    const cop = police.unitAt(tx, ty, PLAYER.punchRange + 12);
    if (cop) {
      police.removeUnit(cop);
      audio.punch();
      events.push({ type: 'cop-punched', x: cop.x, y: cop.y });
      return;
    }
    audio.punch();
  }

  function stepBullets(dt, effects) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.life -= dt;
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      let dead = b.life <= 0;
      if (!dead && hitsBuilding(city, b.x, b.y, 2)) {
        effects.push({ type: 'spark', x: b.x, y: b.y, t: 0, life: 0.15 });
        dead = true;
      }
      if (!dead) {
        const ped = entities.pedAt(b.x, b.y, 14);
        if (ped) {
          entities.knockDown(ped);
          police.addHeat(WANTED.hitPed);
          effects.push({ type: 'poof', x: ped.x, y: ped.y, t: 0, life: 0.4 });
          dead = true;
        }
      }
      if (!dead) {
        const cop = police.unitAt(b.x, b.y, 16);
        if (cop) {
          police.removeUnit(cop);
          effects.push({ type: 'poof', x: cop.x, y: cop.y, t: 0, life: 0.4 });
          dead = true;
        }
      }
      if (!dead) {
        const car = entities.carAt(b.x, b.y, 6);
        if (car && !car.parked) {
          effects.push({ type: 'spark', x: b.x, y: b.y, t: 0, life: 0.15 });
          dead = true;
        }
      }
      if (dead) bullets.splice(i, 1);
    }
  }

  function stepOnFoot(dt, input, camera, effects) {
    const mx = input.moveX();
    const my = input.moveY();
    const moving = mx !== 0 || my !== 0;
    if (moving) {
      const len = Math.hypot(mx, my);
      const speed = input.sprint() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      state.x += (mx / len) * speed * dt;
      state.y += (my / len) * speed * dt;
      state.angle = Math.atan2(my, mx);
    }
    const body = { x: state.x, y: state.y, r: PLAYER.radius };
    collideBuildings(city, body);
    state.x = body.x;
    state.y = body.y;
    clampToWorld(city, state, 24);

    // Pickups on the sidewalk.
    for (const pickup of entities.pickups) {
      if (distance(state.x, state.y, pickup.x, pickup.y) < 28) {
        if (pickup.kind === 'cash') {
          state.cash += pickup.amount;
          events.push({ type: 'pickup-cash', amount: pickup.amount, x: pickup.x, y: pickup.y });
        } else {
          state.ammo += pickup.amount;
          events.push({ type: 'pickup-ammo', amount: pickup.amount, x: pickup.x, y: pickup.y });
        }
        audio.pickup();
        entities.respawnPickup(pickup);
      }
    }

    // Only the player's own bits: the menu keeps pause, confirm and mute.
    const actions = input.takeActions(1 | 2 | 4);
    if (actions & 1) {
      // E: steal the nearest car.
      const car = entities.stealableAt(state.x, state.y, 78);
      if (car) stealCar(car);
    }
    if (actions & 2) punch(input.aimAngle(state.x, state.y, camera));
    if (actions & 4) startReload();
    if (input.shooting()) shootPistol(input.aimAngle(state.x, state.y, camera), effects);
  }

  function stealCar(car) {
    entities.takeCar(car);
    state.inCar = true;
    state.car = {
      x: car.x, y: car.y, angle: car.angle, speed: 0,
      color: car.color, kind: car.kind, length: car.length, width: car.width,
    };
    if (car.driver) {
      police.addHeat(WANTED.stealCar);
      events.push({ type: 'steal-witnessed', x: car.x, y: car.y });
    } else if (witnessed(entities, police, car.x, car.y)) {
      police.addHeat(WANTED.stealCar);
      events.push({ type: 'steal-witnessed', x: car.x, y: car.y });
    } else {
      events.push({ type: 'steal-quiet', x: car.x, y: car.y });
    }
    audio.click();
  }

  function exitCar() {
    if (!state.car) return;
    const car = state.car;
    state.inCar = false;
    state.car = null;
    const side = car.angle + Math.PI / 2;
    state.x = car.x + Math.cos(side) * 44;
    state.y = car.y + Math.sin(side) * 44;
    const body = { x: state.x, y: state.y, r: PLAYER.radius };
    collideBuildings(city, body);
    state.x = body.x;
    state.y = body.y;
    car.parked = true;
    car.speed = 0;
    car.driver = false;
    entities.returnCar(car);
    audio.click();
  }

  function startReload() {
    if (state.reloadTimer > 0 || state.mag >= PLAYER.pistolMag || state.ammo <= 0) return;
    state.reloadTimer = PLAYER.reloadTime;
  }

  function stepDriving(dt, input, effects) {
    const car = state.car;
    const forward = input.moveY() < 0;
    const back = input.moveY() > 0;
    const steer = input.moveX();
    if (forward) car.speed += CAR.accel * dt;
    if (back) {
      if (car.speed > 20) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    }
    const offRoad = !onRoad(city, car.x, car.y);
    const sand = onSand(city, car.x, car.y);
    const drag = sand ? CAR.offRoadDrag * 0.7 : offRoad ? CAR.offRoadDrag : CAR.drag;
    car.speed -= car.speed * drag * dt;
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    const steerAmount = CAR.steer * clamp(Math.abs(car.speed) / 180, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += steer * steerAmount * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;

    // Buildings: two circles (nose and tail) so the car cannot clip a corner.
    // The bounce applies once per step, however many points hit — bouncing
    // twice in one step would kill the speed outright and wedge the car.
    let crashed = false;
    for (const point of carPoints(car)) {
      const body = { x: point.x, y: point.y, r: CAR.radius - 2 };
      const beforeX = body.x;
      const beforeY = body.y;
      collideBuildings(city, body);
      if (body.x !== beforeX || body.y !== beforeY) {
        crashed = true;
        car.x += body.x - point.x;
        car.y += body.y - point.y;
      }
    }
    if (crashed) car.speed *= -0.25;
    if (crashed && Math.abs(car.speed) > 120) {
      audio.crash();
      effects.push({ type: 'smoke', x: car.x, y: car.y, t: 0, life: 0.6 });
    }
    clampToWorld(city, car, 30);

    // Traffic: bump and slow, never pass through. Each car is two circles
    // (nose and tail) sized to its width, so cars in adjacent lanes pass
    // cleanly while a car in your own lane is a real obstacle.
    const myPoints = carPoints(car);
    for (const other of entities.traffic) {
      const ohx = Math.cos(other.angle);
      const ohy = Math.sin(other.angle);
      const otherPoints = [
        { x: other.x + ohx * other.length / 4, y: other.y + ohy * other.length / 4 },
        { x: other.x - ohx * other.length / 4, y: other.y - ohy * other.length / 4 },
      ];
      const minD = CAR.width / 2 + other.width / 2 + 2;
      let hit = false;
      let pushX = 0;
      let pushY = 0;
      for (const mine of myPoints) {
        for (const theirs of otherPoints) {
          const d = distance(mine.x, mine.y, theirs.x, theirs.y);
          if (d < minD && d > 0.01) {
            hit = true;
            const push = (minD - d) / d;
            pushX += (mine.x - theirs.x) * push * 0.5;
            pushY += (mine.y - theirs.y) * push * 0.5;
          }
        }
      }
      if (hit) {
        car.x += pushX;
        car.y += pushY;
        if (!touching.has(other)) {
          touching.add(other);
          car.speed *= 0.82;
          if (Math.abs(car.speed) > 140) {
            audio.crash();
            effects.push({ type: 'smoke', x: (car.x + other.x) / 2, y: (car.y + other.y) / 2, t: 0, life: 0.5 });
          }
        } else {
          car.speed *= 0.995;
        }
      } else if (touching.has(other)) {
        touching.delete(other);
      }
    }

    // Pedestrians: hitting one is a crime, and it slows the car.
    for (const ped of entities.peds) {
      if (ped.state === 'down') continue;
      if (distance(car.x, car.y, ped.x, ped.y) < CAR.radius + 10 && Math.abs(car.speed) > 60) {
        entities.knockDown(ped);
        police.addHeat(WANTED.hitPed);
        car.speed *= 0.7;
        audio.crash();
        events.push({ type: 'ped-run-over', x: ped.x, y: ped.y });
      }
    }

    // Hard cornering leaves skid marks.
    if (Math.abs(steer) > 0.5 && Math.abs(car.speed) > 260 && Math.random() < dt * 20) {
      effects.push({ type: 'skid', x: car.x, y: car.y, angle: car.angle, t: 0, life: 1.4 });
    }

    const actions = input.takeActions(1 | 2 | 4);
    if (actions & 1) exitCar();
  }

  return {
    state,
    bullets,
    events,
    reset,
    get x() {
      return state.inCar && state.car ? state.car.x : state.x;
    },
    get y() {
      return state.inCar && state.car ? state.car.y : state.y;
    },
    get carX() {
      return state.car ? state.car.x : state.x;
    },
    get carY() {
      return state.car ? state.car.y : state.y;
    },
    get carSpeed() {
      return state.car ? Math.abs(state.car.speed) : 0;
    },
    get inCar() {
      return state.inCar;
    },
    /** Push the player's car (police ramming): a positional shove only. The
     * speed cut for a ram lives in `rammed`, applied once per shove. */
    pushCar(dx, dy) {
      if (state.car) {
        state.car.x += dx;
        state.car.y += dy;
      }
    },
    /** One ram's speed cut: the car loses 10% when a police car first leans
     * on it, then it can fight back instead of being ground to a halt. */
    rammed() {
      if (state.car) state.car.speed *= 0.9;
    },
    damage,
    addCash(amount) {
      state.cash += amount;
    },
    givePistol() {
      state.hasPistol = true;
    },
    /** One fixed step: move, drive, fight, pick up. */
    update(dt, input, camera, effects) {
      if (state.hurt > 0) state.hurt -= dt;
      if (state.punchCooldown > 0) state.punchCooldown -= dt;
      if (state.pistolCooldown > 0) state.pistolCooldown -= dt;
      if (state.reloadTimer > 0) {
        state.reloadTimer -= dt;
        if (state.reloadTimer <= 0) {
          const need = PLAYER.pistolMag - state.mag;
          const take = Math.min(need, state.ammo);
          state.mag += take;
          state.ammo -= take;
        }
      }
      if (state.inCar) stepDriving(dt, input, effects);
      else stepOnFoot(dt, input, camera, effects);
      stepBullets(dt, effects);
    },
  };
}
