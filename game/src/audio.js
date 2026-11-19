// All sound is synthesized with WebAudio: no audio files, nothing fetched.
// A tiny step sequencer plays a sun-soaked bass-and-keys loop, and one-shots
// cover the engine hum, sirens, gunfire, punches and pickups. Everything starts
// on the first user gesture, and M toggles mute.

const MUSIC_BPM = 96;
const BASS_LINE = [0, 0, 7, 0, 5, 0, 3, 2, 0, 0, 7, 10, 5, 3, 2, 0];
const CHORDS = [[0, 3, 7], [5, 8, 12], [3, 7, 10], [5, 8, 12]];
const ROOT = 55; // A1

function noteFrequency(semitones) {
  return ROOT * Math.pow(2, semitones / 12);
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;
  let nextStepTime = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Engine: a low sawtooth whose pitch follows the speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a sine that wails between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  function blip(frequency, duration, type, volume, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!ctx) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function scheduleStep() {
    if (!ctx) return;
    const stepSeconds = 60 / MUSIC_BPM / 2;
    while (nextStepTime < ctx.currentTime + 0.15) {
      const s = step % 16;
      const bass = BASS_LINE[s];
      if (bass !== undefined) {
        const t = nextStepTime;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = noteFrequency(bass);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + stepSeconds * 0.9);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(t);
        osc.stop(t + stepSeconds);
      }
      if (s % 8 === 0) {
        const chord = CHORDS[(step / 8 | 0) % CHORDS.length];
        for (const note of chord) {
          const t = nextStepTime;
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = noteFrequency(note + 12);
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.12, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + stepSeconds * 7);
          osc.connect(gain);
          gain.connect(musicGain);
          osc.start(t);
          osc.stop(t + stepSeconds * 7);
        }
      }
      if (s % 4 === 2) noiseBurstAt(nextStepTime, 0.05, 6000, 0.05);
      step += 1;
      nextStepTime += stepSeconds;
    }
  }

  function noiseBurstAt(when, duration, filterFreq, volume) {
    if (!ctx) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    source.start(when);
  }

  function startMusic() {
    if (musicTimer !== null) return;
    nextStepTime = ctx.currentTime + 0.1;
    step = 0;
    musicTimer = window.setInterval(scheduleStep, 40);
  }

  return {
    /** Call on the first gesture: builds the graph and starts the music. */
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.55;
    },
    isMuted() {
      return muted;
    },
    /** Engine hum follows speed 0..1; 0 silences it. */
    engine(speed01) {
      if (!ctx || !engineOsc) return;
      engineOsc.frequency.value = 52 + speed01 * 130;
      engineGain.gain.value = speed01 * 0.06;
    },
    /** Siren wail; 0 silences it. Call every frame with police nearness 0..1. */
    siren(level01) {
      if (!ctx || !sirenOsc) return;
      sirenOsc.frequency.value = 700 + Math.sin(performance.now() / 380) * 220;
      sirenGain.gain.value = level01 * 0.045;
    },
    shot() {
      noiseBurst(0.12, 0.5, 2400);
      blip(160, 0.08, 'square', 0.25);
    },
    punch() {
      noiseBurst(0.09, 0.4, 500);
      blip(90, 0.1, 'sine', 0.4);
    },
    pickup() {
      blip(880, 0.09, 'sine', 0.3);
      blip(1318, 0.14, 'sine', 0.3, 0.07);
    },
    crash() {
      noiseBurst(0.25, 0.5, 900);
    },
    click() {
      blip(660, 0.05, 'sine', 0.2);
    },
    missionDone() {
      blip(523, 0.12, 'triangle', 0.35);
      blip(659, 0.12, 'triangle', 0.35, 0.12);
      blip(784, 0.22, 'triangle', 0.35, 0.24);
    },
    busted() {
      blip(392, 0.2, 'sawtooth', 0.25);
      blip(311, 0.35, 'sawtooth', 0.25, 0.2);
    },
  };
}
