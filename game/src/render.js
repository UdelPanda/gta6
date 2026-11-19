// Everything the eye sees: the city, its cars and people, the effects, the
// HUD with its minimap, and the title, pause and end screens. The renderer
// only reads state; it never changes it.

import { FONT, MINIMAP, PALETTE, WORLD } from './config.js';
import { clamp } from './random.js';

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawStar(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function createRenderer(canvas, city) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function drawGround(view) {
    const { cam } = view;
    const x0 = cam.x - cam.viewW / 2 / cam.zoom - 40;
    const y0 = cam.y - cam.viewH / 2 / cam.zoom - 40;
    const x1 = cam.x + cam.viewW / 2 / cam.zoom + 40;
    const y1 = cam.y + cam.viewH / 2 / cam.zoom + 40;
    // Base ground, then the beach band and the sea.
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (y1 > city.beachY) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(x0, Math.max(y0, city.beachY), x1 - x0, Math.min(y1, city.waterY) - Math.max(y0, city.beachY));
    }
    if (y1 > city.waterY) {
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(x0, Math.max(y0, city.waterY), x1 - x0, y1 - Math.max(y0, city.waterY));
      ctx.fillStyle = PALETTE.waterDeep;
      for (let i = 0; i < 5; i += 1) {
        const wy = city.waterY + 40 + i * 46 + ((view.time * 12 + i * 37) % 46);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x0, wy, x1 - x0, 3);
      }
      ctx.globalAlpha = 1;
    }
    // Parks.
    for (const park of city.parks) {
      if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
    }
  }

  function drawRoads(view) {
    const { cam } = view;
    const x0 = cam.x - cam.viewW / 2 / cam.zoom - 60;
    const y0 = cam.y - cam.viewH / 2 / cam.zoom - 60;
    const x1 = cam.x + cam.viewW / 2 / cam.zoom + 60;
    const y1 = cam.y + cam.viewH / 2 / cam.zoom + 60;
    const { pitch, road } = city;
    const half = road / 2;
    // Sidewalks: a pale band under each street, wider than the asphalt.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const s of city.streets) {
      if (s > y0 - 80 && s < y1 + 80) ctx.fillRect(x0, s - half - 18, x1 - x0, road + 36);
      if (s > x0 - 80 && s < x1 + 80) ctx.fillRect(s - half - 18, y0, road + 36, y1 - y0);
    }
    // Asphalt.
    ctx.fillStyle = PALETTE.asphalt;
    for (const s of city.streets) {
      if (s > y0 - 60 && s < y1 + 60) ctx.fillRect(x0, s - half, x1 - x0, road);
      if (s > x0 - 60 && s < x1 + 60) ctx.fillRect(s - half, y0, road, y1 - y0);
    }
    // Centre dashes.
    ctx.fillStyle = PALETTE.lane;
    const dash = 34;
    const gap = 30;
    for (const s of city.streets) {
      if (s > y0 - 60 && s < y1 + 60) {
        for (let x = Math.floor(x0 / (dash + gap)) * (dash + gap); x < x1; x += dash + gap) {
          ctx.fillRect(x, s - 2, dash, 4);
        }
      }
      if (s > x0 - 60 && s < x1 + 60) {
        for (let y = Math.floor(y0 / (dash + gap)) * (dash + gap); y < y1; y += dash + gap) {
          ctx.fillRect(s - 2, y, 4, dash);
        }
      }
    }
    // Crosswalks where streets meet.
    ctx.fillStyle = '#e8e4da';
    for (const sx of city.streets) {
      for (const sy of city.streets) {
        if (sx < x0 - 80 || sx > x1 + 80 || sy < y0 - 80 || sy > y1 + 80) continue;
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(sx + i * 16 - 5, sy - half - 4, 10, 8);
          ctx.fillRect(sx + i * 16 - 5, sy + half - 4, 10, 8);
          ctx.fillRect(sx - half - 4, sy + i * 16 - 5, 8, 10);
          ctx.fillRect(sx + half - 4, sy + i * 16 - 5, 8, 10);
        }
      }
    }
  }

  function drawBuildings(view) {
    const { cam } = view;
    const x0 = cam.x - cam.viewW / 2 / cam.zoom - 60;
    const y0 = cam.y - cam.viewH / 2 / cam.zoom - 60;
    const x1 = cam.x + cam.viewW / 2 / cam.zoom + 60;
    const y1 = cam.y + cam.viewH / 2 / cam.zoom + 60;
    for (const b of city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      if (b.tall) {
        ctx.fillStyle = '#00000030';
        ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
      }
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = PALETTE.roofEdge;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      // Roof props: vents, skylights, the odd pool.
      const rng = b.seed;
      ctx.fillStyle = '#00000022';
      for (let i = 0; i < b.vents; i += 1) {
        const vx = b.x + 14 + ((rng * (i + 3) * 97) % Math.max(10, b.w - 40));
        const vy = b.y + 14 + ((rng * (i + 5) * 61) % Math.max(10, b.h - 40));
        ctx.fillRect(vx, vy, 18, 14);
      }
      if (b.pool) {
        ctx.fillStyle = '#5ec4e8';
        ctx.beginPath();
        ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, 26, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Landmark name bars are painted after the HUD (drawLandmarkLabels),
      // never here: drawn in world space they slide under the HUD panels.
    }
    // Trees.
    for (const tree of city.trees) {
      if (tree.x < x0 || tree.x > x1 || tree.y < y0 || tree.y > y1) continue;
      ctx.fillStyle = '#00000025';
      ctx.beginPath();
      ctx.ellipse(tree.x + 4, tree.y + 5, tree.r, tree.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.treeLight;
      ctx.beginPath();
      ctx.arc(tree.x - 3, tree.y - 3, tree.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function landmarkName(key) {
    switch (key) {
      case 'casino': return 'THE COUNTESS';
      case 'bank': return 'SOLSTICE BANK';
      case 'docks': return 'MARINA DOCKS';
      case 'hideout': return 'HIDEOUT';
      case 'motel': return 'SUNSET MOTEL';
      case 'hospital': return 'ST. PALMA';
      case 'station': return 'PRECINCT';
      case 'airstrip': return 'PALM AIRSTRIP';
      case 'chopshop': return "BIG AL'S";
      default: return '';
    }
  }

  function drawCarShape(x, y, angle, length, width, color, opts = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#00000035';
    ctx.beginPath();
    ctx.ellipse(3, 4, length / 2, width / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, -length / 2, -width / 2, length, width, 9);
    ctx.fill();
    ctx.fillStyle = '#20242c';
    roundRect(ctx, -length * 0.18, -width / 2 + 4, length * 0.36, width - 8, 5);
    ctx.fill();
    ctx.fillStyle = '#bcd8e8';
    roundRect(ctx, length * 0.22, -width / 2 + 5, length * 0.16, width - 10, 4);
    ctx.fill();
    ctx.fillStyle = '#bcd8e8';
    roundRect(ctx, -length * 0.38, -width / 2 + 5, length * 0.14, width - 10, 4);
    ctx.fill();
    if (opts.taxi) {
      ctx.fillStyle = '#20242c';
      ctx.fillRect(-8, -width / 2 - 2, 16, 6);
      ctx.fillStyle = '#f2c230';
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TAXI', 0, -width / 2 + 1);
    }
    if (opts.police) {
      const flashing = Math.floor(opts.time * 4) % 2 === 0;
      ctx.fillStyle = flashing ? '#ff3b30' : '#2b6fd6';
      ctx.fillRect(-6, -width / 2 - 1, 7, 5);
      ctx.fillStyle = flashing ? '#2b6fd6' : '#ff3b30';
      ctx.fillRect(1, -width / 2 - 1, 7, 5);
      ctx.fillStyle = '#f5efe0';
      ctx.font = `bold 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('SCPD', 0, 2);
    }
    // Headlights: two warm dots at the nose.
    ctx.fillStyle = PALETTE.headlight;
    ctx.beginPath();
    ctx.arc(length / 2 - 2, -width / 2 + 6, 3, 0, Math.PI * 2);
    ctx.arc(length / 2 - 2, width / 2 - 6, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPedShape(ped) {
    if (ped.state === 'down') {
      ctx.fillStyle = '#00000030';
      ctx.beginPath();
      ctx.ellipse(ped.x + 2, ped.y + 3, 12, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 12, 7, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = '#00000030';
    ctx.beginPath();
    ctx.ellipse(ped.x + 2, ped.y + 3, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayerShape(view) {
    const { player } = view;
    const p = player.state;
    if (p.inCar && p.car) {
      drawCarShape(p.car.x, p.car.y, p.car.angle, p.car.length, p.car.width, p.car.color, {});
      return;
    }
    // On foot: a yellow-jacketed figure with a facing tick and a gun line.
    ctx.fillStyle = '#00000030';
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + 3, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5b12';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#20242c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18);
    ctx.stroke();
    if (p.hasPistol) {
      ctx.strokeStyle = '#20242c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.angle) * 14, p.y + Math.sin(p.angle) * 14);
      ctx.lineTo(p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26);
      ctx.stroke();
    }
  }

  function drawEffects(view) {
    for (const effect of view.effects) {
      const age = effect.t / effect.life;
      if (effect.type === 'muzzle') {
        ctx.save();
        ctx.translate(effect.x, effect.y);
        ctx.rotate(effect.angle);
        ctx.fillStyle = '#ffd94d';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(16, -4);
        ctx.lineTo(10, 0);
        ctx.lineTo(16, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (effect.type === 'tracer') {
        ctx.strokeStyle = `rgba(255, 90, 60, ${1 - age})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(effect.x, effect.y);
        ctx.lineTo(effect.x2, effect.y2);
        ctx.stroke();
      } else if (effect.type === 'smoke') {
        ctx.fillStyle = `rgba(60, 60, 66, ${0.5 * (1 - age)})`;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, 8 + age * 22, 0, Math.PI * 2);
        ctx.fill();
      } else if (effect.type === 'skid') {
        ctx.save();
        ctx.translate(effect.x, effect.y);
        ctx.rotate(effect.angle);
        ctx.fillStyle = `rgba(20, 20, 24, ${0.35 * (1 - age)})`;
        ctx.fillRect(-16, -14, 32, 4);
        ctx.fillRect(-16, 10, 32, 4);
        ctx.restore();
      } else if (effect.type === 'spark') {
        ctx.fillStyle = `rgba(255, 220, 90, ${1 - age})`;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, 5 * (1 - age) + 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (effect.type === 'poof') {
        ctx.fillStyle = `rgba(245, 239, 224, ${0.8 * (1 - age)})`;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, 6 + age * 18, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPickups(view) {
    const { cam } = view;
    for (const pickup of view.entities.pickups) {
      if (Math.abs(pickup.x - cam.x) > cam.viewW / 2 / cam.zoom + 40) continue;
      if (Math.abs(pickup.y - cam.y) > cam.viewH / 2 / cam.zoom + 40) continue;
      const bob = Math.sin(view.time * 3 + pickup.bob) * 3;
      if (pickup.kind === 'cash') {
        ctx.fillStyle = PALETTE.cash;
        ctx.beginPath();
        ctx.arc(pickup.x, pickup.y + bob, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1d4d1f';
        ctx.font = `bold 11px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', pickup.x, pickup.y + bob + 0.5);
      } else {
        ctx.fillStyle = '#ff8a5c';
        ctx.fillRect(pickup.x - 8, pickup.y + bob - 5, 16, 10);
        ctx.fillStyle = '#20242c';
        ctx.font = `bold 8px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('AMMO', pickup.x, pickup.y + bob + 0.5);
      }
    }
  }

  function drawWaypoint(view) {
    const target = view.missionTarget;
    if (!target) return;
    const { cam } = view;
    const dx = target.x - view.player.x;
    const dy = target.y - view.player.y;
    const dist = Math.hypot(dx, dy);
    // A pulsing diamond on the spot itself.
    const pulse = 1 + Math.sin(view.time * 4) * 0.12;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = PALETTE.objective;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(12, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // An arrow at the screen edge when the marker is off-screen.
    const sx = (target.x - cam.x) * cam.zoom + cam.viewW / 2;
    const sy = (target.y - cam.y) * cam.zoom + cam.viewH / 2;
    if (sx < 20 || sx > cam.viewW - 20 || sy < 20 || sy > cam.viewH - 20) {
      const angle = Math.atan2(dy, dx);
      const ex = clamp(cam.viewW / 2 + Math.cos(angle) * (cam.viewW / 2 - 46), 30, cam.viewW - 30);
      const ey = clamp(cam.viewH / 2 + Math.sin(angle) * (cam.viewH / 2 - 46), 30, cam.viewH - 30);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(angle);
      ctx.fillStyle = PALETTE.objective;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -10);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    return dist;
  }

  function drawMinimap(view) {
    const { cam } = view;
    const size = MINIMAP.size;
    const mx = cam.viewW - size - MINIMAP.margin;
    const my = MINIMAP.margin;
    const scale = size / WORLD.size;
    ctx.fillStyle = '#10131acc';
    ctx.fillRect(mx - 6, my - 6, size + 12, size + 12);
    ctx.strokeStyle = PALETTE.panelBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 6.5, my - 6.5, size + 13, size + 13);
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, size, size);
    ctx.clip();
    ctx.fillStyle = '#233d4a';
    ctx.fillRect(mx, my, size, size);
    // Sea.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(mx, my + city.waterY * scale, size, size - city.waterY * scale);
    // Roads.
    ctx.strokeStyle = '#5a6274';
    ctx.lineWidth = 2;
    for (const s of city.streets) {
      ctx.beginPath();
      ctx.moveTo(mx, my + s * scale);
      ctx.lineTo(mx + size, my + s * scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx + s * scale, my);
      ctx.lineTo(mx + s * scale, my + size);
      ctx.stroke();
    }
    // Mission marker.
    const target = view.missionTarget;
    if (target) {
      ctx.fillStyle = PALETTE.objective;
      ctx.beginPath();
      ctx.arc(mx + target.x * scale, my + target.y * scale, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic as faint dots, police as blue dots.
    ctx.fillStyle = '#c8cdd8';
    for (const car of view.entities.traffic) {
      ctx.fillRect(mx + car.x * scale - 1, my + car.y * scale - 1, 2, 2);
    }
    for (const unit of view.police.units) {
      ctx.fillStyle = unit.mode === 'foot' ? '#7fb3ff' : '#2b6fd6';
      ctx.beginPath();
      ctx.arc(mx + unit.x * scale, my + unit.y * scale, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a yellow arrow that turns with them.
    ctx.save();
    ctx.translate(mx + view.player.x * scale, my + view.player.y * scale);
    ctx.rotate(view.player.state.inCar && view.player.state.car ? view.player.state.car.angle : view.player.state.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('SOLSTICE CITY', mx + size, my + size - 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  // Landmark name bars, painted in screen space after the HUD so no panel
  // ever clips them: the same dark strip across the building's middle with
  // the name in accent capitals that the world pass used to paint.
  function drawLandmarkLabels(view) {
    const { cam } = view;
    for (const b of city.buildings) {
      if (!b.landmark) continue;
      const sx = (b.x - cam.x) * cam.zoom + cam.viewW / 2;
      const sy = (b.y + b.h / 2 - cam.y) * cam.zoom + cam.viewH / 2;
      const w = b.w * cam.zoom;
      const h = 26 * cam.zoom;
      if (sx + w < 0 || sx > cam.viewW || sy + h / 2 < 0 || sy - h / 2 > cam.viewH) continue;
      ctx.fillStyle = '#20242cee';
      ctx.fillRect(sx, sy - h / 2, w, h);
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `bold ${Math.max(9, Math.round(15 * cam.zoom))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(landmarkName(b.landmark), sx + w / 2, sy + 1);
    }
  }

  function drawHud(view) {
    const { cam } = view;
    const p = view.player.state;
    // Top-left status panel.
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, 12, 12, 250, 108, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, 12, 12, 250, 108, 10);
    ctx.stroke();
    ctx.fillStyle = PALETTE.cash;
    ctx.font = `bold 24px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`$${Math.floor(p.cash).toLocaleString('en-US')}`, 26, 22);
    // Wanted stars.
    for (let i = 0; i < 5; i += 1) {
      drawStar(ctx, 34 + i * 26, 66, 10, i < view.police.wanted ? PALETTE.danger : '#ffffff33');
    }
    // Health bar.
    ctx.fillStyle = '#ffffff22';
    ctx.fillRect(26, 84, 150, 10);
    ctx.fillStyle = p.health > 30 ? PALETTE.health : '#ff2d20';
    ctx.fillRect(26, 84, 150 * clamp(p.health / 100, 0, 1), 10);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`${Math.ceil(p.health)}`, 182, 82);
    // Ammo, once the player has a gun.
    if (p.hasPistol) {
      ctx.fillStyle = p.mag === 0 ? PALETTE.danger : PALETTE.text;
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${p.mag} / ${p.ammo}`, 248, 84);
      ctx.textAlign = 'left';
    }
    // "Losing them…" progress, under the status panel, while the heat fades.
    if (view.losingCue) {
      const cue = view.losingCue;
      ctx.fillStyle = PALETTE.panel;
      roundRect(ctx, 12, 128, 250, 40, 10);
      ctx.fill();
      ctx.strokeStyle = PALETTE.panelBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, 12, 128, 250, 40, 10);
      ctx.stroke();
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(cue.text, 26, 136);
      ctx.fillStyle = '#ffffff22';
      ctx.fillRect(26, 154, 222, 6);
      ctx.fillStyle = PALETTE.cash;
      ctx.fillRect(26, 154, 222 * clamp(cue.progress, 0, 1), 6);
    }
    drawMinimap(view);
    // Mission progress + current objective, bottom centre.
    const mission = view.missions.current();
    const stepText = view.stepText || '';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const boxW = Math.min(cam.viewW - 40, 620);
    const boxX = (cam.viewW - boxW) / 2;
    const boxY = cam.viewH - 62;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, boxX, boxY, boxW, 48, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelBorder;
    roundRect(ctx, boxX, boxY, boxW, 48, 10);
    ctx.stroke();
    ctx.fillStyle = PALETTE.accent;
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillText(view.missions.progressText(), cam.viewW / 2, boxY + 13);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `13px ${FONT}`;
    const objective = stepText + (view.objectiveDistance != null ? `  —  ${Math.round(view.objectiveDistance)}m` : '');
    ctx.fillText(objective, cam.viewW / 2, boxY + 33);
    // Contextual hint, above the mission bar, on a dark pill so it reads
    // over pale ground as well as asphalt.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `12px ${FONT}`;
    const hintW = ctx.measureText(view.hint).width;
    ctx.fillStyle = '#10131acc';
    roundRect(ctx, 8, cam.viewH - 78 - 11, hintW + 12, 22, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(view.hint, 14, cam.viewH - 78);
    // Speed, bottom right, when driving.
    if (p.inCar && p.car) {
      const mph = Math.round(Math.abs(p.car.speed) * 0.12);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 30px ${FONT}`;
      ctx.fillText(`${mph}`, cam.viewW - 44, cam.viewH - 26);
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('mph', cam.viewW - 16, cam.viewH - 22);
      ctx.textAlign = 'left';
    }
    // Reloading.
    if (p.reloadTimer > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText('RELOADING…', cam.viewW / 2, cam.viewH - 84);
      ctx.textAlign = 'left';
    }
    // Hurt vignette.
    if (p.hurt > 0) {
      ctx.fillStyle = `rgba(255, 40, 30, ${p.hurt * 0.28})`;
      ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    }
    // Toasts, below the status panel — or below the losing-them cue.
    let ty = view.losingCue ? 176 : 132;
    for (const toast of view.toasts) {
      ctx.globalAlpha = clamp(toast.life, 0, 1);
      ctx.fillStyle = PALETTE.panel;
      const tw = ctx.measureText(toast.text).width + 28;
      roundRect(ctx, 12, ty, tw, 30, 8);
      ctx.fill();
      ctx.fillStyle = toast.good ? PALETTE.cash : PALETTE.text;
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(toast.text, 26, ty + 16);
      ty += 38;
    }
    ctx.globalAlpha = 1;
    // Mission intro card.
    if (view.intro) {
      const iw = Math.min(cam.viewW - 60, 560);
      const ix = (cam.viewW - iw) / 2;
      const iy = 150;
      ctx.fillStyle = '#10131af2';
      roundRect(ctx, ix, iy, iw, 132, 12);
      ctx.fill();
      ctx.strokeStyle = PALETTE.accent;
      ctx.lineWidth = 2;
      roundRect(ctx, ix, iy, iw, 132, 12);
      ctx.stroke();
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `bold 17px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(view.intro.title, cam.viewW / 2, iy + 28);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `14px ${FONT}`;
      wrapText(view.intro.text, cam.viewW / 2, iy + 52, iw - 40, 20);
    }
  }

  function wrapText(text, cx, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let ly = y;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, cx, ly);
        line = word;
        ly += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, ly);
    ctx.textAlign = 'left';
  }

  function drawTitle(view) {
    const { cam } = view;
    // The title screen plays the city behind it: draw the world first.
    ctx.fillStyle = '#1a2030';
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.accent;
    ctx.font = `bold ${Math.min(84, cam.viewW / 12)}px ${FONT}`;
    ctx.fillText('SOLSTICE CITY', cam.viewW / 2, cam.viewH * 0.3);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `20px ${FONT}`;
    ctx.fillText('An open-world crime story — drive, steal, run, and buy your way out.', cam.viewW / 2, cam.viewH * 0.3 + 58);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText('WASD move & drive · E steal / enter car · Mouse aim, click to shoot · F punch · R reload', cam.viewW / 2, cam.viewH * 0.3 + 96);
    ctx.fillText('Shift sprint · P pause · M mute', cam.viewW / 2, cam.viewH * 0.3 + 120);
    const blink = Math.floor(view.time * 1.6) % 2 === 0;
    if (blink) {
      ctx.fillStyle = PALETTE.player;
      ctx.font = `bold 24px ${FONT}`;
      ctx.fillText(view.save ? 'Press Enter or click — Continue your story' : 'Press Enter or click — Start a new story', cam.viewW / 2, cam.viewH * 0.62);
    }
    if (view.save) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `14px ${FONT}`;
      ctx.fillText(`Saved: $${Math.floor(view.save.cash).toLocaleString('en-US')} · Mission ${Math.min(view.save.missionIndex + 1, 5)}/5 · ${view.save.missionsDone} mission${view.save.missionsDone === 1 ? '' : 's'} done`, cam.viewW / 2, cam.viewH * 0.62 + 36);
    }
    ctx.fillStyle = '#ffffff88';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('A wholly original game. No part of it comes from any commercial game.', cam.viewW / 2, cam.viewH - 30);
  }

  function drawPanel(view, title, lines, accent) {
    const { cam } = view;
    ctx.fillStyle = '#10131ad9';
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    const w = Math.min(520, cam.viewW - 60);
    const x = (cam.viewW - w) / 2;
    const y = cam.viewH / 2 - 110;
    ctx.fillStyle = '#10131af2';
    roundRect(ctx, x, y, w, 220, 12);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.accent;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, 220, 12);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent || PALETTE.accent;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText(title, cam.viewW / 2, y + 44);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `15px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, cam.viewW / 2, y + 92 + i * 26);
    });
    const blink = Math.floor(view.time * 1.6) % 2 === 0;
    if (blink) {
      ctx.fillStyle = PALETTE.player;
      ctx.font = `bold 17px ${FONT}`;
      ctx.fillText('Press Enter to continue', cam.viewW / 2, y + 188);
    }
  }

  return {
    resize,
    /**
     * Paint one frame. `view` carries the camera, the player, entities,
     * police, missions, effects and the screen-specific extras; `screen` is
     * title | play | paused | busted | wasted | complete.
     */
    draw(view, screen) {
      const size = resize();
      const cam = view.cam;
      cam.viewW = size.w;
      cam.viewH = size.h;
      ctx.clearRect(0, 0, size.w, size.h);
      if (screen === 'title') {
        drawTitle(view);
        return;
      }
      const zoom = cam.zoom;
      ctx.save();
      ctx.translate(cam.viewW / 2, cam.viewH / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-cam.x, -cam.y);
      drawGround(view);
      drawRoads(view);
      drawBuildings(view);
      drawPickups(view);
      for (const car of view.entities.traffic) {
        drawCarShape(car.x, car.y, car.angle, car.length, car.width, car.color, { taxi: car.kind === 'taxi' });
      }
      for (const unit of view.police.units) {
        if (unit.mode === 'car') {
          drawCarShape(unit.x, unit.y, unit.angle, 62, 30, '#e8e4da', { police: true, time: view.time });
        } else {
          ctx.fillStyle = '#00000030';
          ctx.beginPath();
          ctx.ellipse(unit.x + 2, unit.y + 3, 10, 7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1e4f9e';
          ctx.beginPath();
          ctx.arc(unit.x, unit.y, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f2c29b';
          ctx.beginPath();
          ctx.arc(unit.x, unit.y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (const ped of view.entities.peds) drawPedShape(ped);
      drawPlayerShape(view);
      for (const bullet of view.player.bullets) {
        ctx.strokeStyle = '#ffd94d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bullet.x - Math.cos(bullet.angle) * 14, bullet.y - Math.sin(bullet.angle) * 14);
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();
      }
      drawEffects(view);
      view.objectiveDistance = drawWaypoint(view);
      ctx.restore();
      drawHud(view);
      drawLandmarkLabels(view);
      if (screen === 'paused') {
        drawPanel(view, 'PAUSED', ['Your story waits where you left it.', `Cash $${Math.floor(view.player.state.cash).toLocaleString('en-US')} · ${view.missions.progressText()}`], PALETTE.text);
      } else if (screen === 'busted') {
        drawPanel(view, 'BUSTED', ['The SCPD caught up with you.', `You lost $${Math.floor(view.lostCash || 0).toLocaleString('en-US')} in fines.`, 'The heat is off — for now.'], PALETTE.police);
      } else if (screen === 'wasted') {
        drawPanel(view, 'WASTED', ['St. Palma Hospital patched you up.', `You lost $${Math.floor(view.lostCash || 0).toLocaleString('en-US')}.`, 'The city is still out there.'], PALETTE.danger);
      } else if (screen === 'complete') {
        drawPanel(view, 'KING OF SOLSTICE', ['Rico Vega flew out a free man.', `Final cash: $${Math.floor(view.player.state.cash).toLocaleString('en-US')}`, 'Thanks for playing Solstice City.'], PALETTE.accent);
      }
    },
  };
}
