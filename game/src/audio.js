// Audio: every sound is synthesized with WebAudio, so the game ships no audio
// files and makes no network request. Created on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration, frequency, type = 'lowpass', gain = 0.5, slideTo = null, when = 0 }) {
    if (!ensure() || !enabled || ctx.state === 'suspended') return;
    const start = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    if (slideTo !== null) filter.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(start);
    source.stop(start + duration);
  }

  function tone({ frequency, duration, type = 'sine', gain = 0.3, slideTo = null, when = 0 }) {
    if (!ensure() || !enabled || ctx.state === 'suspended') return;
    const start = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(start);
    osc.stop(start + duration);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    shot(kind) {
      if (kind === 'sniper') burst({ duration: 0.28, frequency: 1400, slideTo: 180, gain: 0.8 });
      else if (kind === 'shotgun') burst({ duration: 0.22, frequency: 900, slideTo: 120, gain: 0.8 });
      else burst({ duration: 0.11, frequency: 2400, slideTo: 320, gain: 0.55 });
      tone({ frequency: 160, duration: 0.07, type: 'square', gain: 0.12, slideTo: 60 });
    },
    distantShot() {
      burst({ duration: 0.12, frequency: 900, slideTo: 200, gain: 0.14 });
    },
    dryFire() {
      tone({ frequency: 1400, duration: 0.03, type: 'square', gain: 0.15 });
    },
    reload() {
      tone({ frequency: 900, duration: 0.04, type: 'square', gain: 0.12 });
      tone({ frequency: 600, duration: 0.05, type: 'square', gain: 0.12, when: 0.35 });
    },
    hit() {
      tone({ frequency: 2200, duration: 0.05, type: 'sine', gain: 0.25 });
    },
    kill() {
      tone({ frequency: 2200, duration: 0.05, type: 'sine', gain: 0.25 });
      tone({ frequency: 2900, duration: 0.08, type: 'sine', gain: 0.25, when: 0.06 });
    },
    hurt() {
      tone({ frequency: 220, duration: 0.16, type: 'sawtooth', gain: 0.2, slideTo: 110 });
    },
    plantBeep() {
      tone({ frequency: 1150, duration: 0.09, type: 'square', gain: 0.2 });
    },
    defuseBeep() {
      tone({ frequency: 880, duration: 0.09, type: 'square', gain: 0.2 });
    },
    explosion() {
      burst({ duration: 0.9, frequency: 500, slideTo: 60, gain: 0.9 });
      tone({ frequency: 70, duration: 0.7, type: 'sine', gain: 0.5, slideTo: 32 });
    },
    roundWin() {
      tone({ frequency: 523, duration: 0.14, type: 'triangle', gain: 0.25 });
      tone({ frequency: 659, duration: 0.14, type: 'triangle', gain: 0.25, when: 0.13 });
      tone({ frequency: 784, duration: 0.22, type: 'triangle', gain: 0.25, when: 0.26 });
    },
    roundLose() {
      tone({ frequency: 392, duration: 0.16, type: 'triangle', gain: 0.25 });
      tone({ frequency: 330, duration: 0.16, type: 'triangle', gain: 0.25, when: 0.15 });
      tone({ frequency: 262, duration: 0.28, type: 'triangle', gain: 0.25, when: 0.3 });
    },
    buy() {
      tone({ frequency: 1320, duration: 0.06, type: 'sine', gain: 0.2 });
      tone({ frequency: 1760, duration: 0.08, type: 'sine', gain: 0.2, when: 0.06 });
    },
    click() {
      tone({ frequency: 700, duration: 0.03, type: 'square', gain: 0.1 });
    },
    toggleMute() {
      enabled = !enabled;
      return enabled;
    },
  };
}
