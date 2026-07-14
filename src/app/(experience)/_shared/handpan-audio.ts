"use client";

// Ported from a standalone prototype ("Ding — meditaciones generativas en handpan")
// shared as a design reference. Tuned to D Low Pygmy (Ding D3, circle cycling
// D-E-F-A-C — a minor pentatonic with an added major 2nd, missing the 4th/b7 that
// made the original D Kurd tuning read as moody). Pure synthesis, no audio files:
// paired near-unison sine partials (gentle chorus) plus a soft octave/twelfth,
// rounded off by a lowpass filter and a noise-based convolution reverb — that
// combination is what keeps it from sounding like a bare digital tone.
//
// Module-level singleton by design: the (experience) route group shares one layout,
// so the AudioContext and mute preference need to survive client-side navigation
// between screens, not get recreated per-page.

const DING_NOTE = "D3";
const SCALE_NOTES = ["D4", "E4", "F4", "A4", "C5", "D5", "E5", "F5"];

const NOTE_OFFSETS: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

function noteToFreq(note: string): number {
  const match = note.match(/^([A-G])(#|b)?(-?\d+)$/);
  if (!match) throw new Error(`Invalid note: ${note}`);
  const key = match[1] + (match[2] ?? "");
  const semitone = NOTE_OFFSETS[key];
  const octave = parseInt(match[3], 10);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// A soft, lowpass-filtered noise tail — warmer than a bright digital reverb impulse.
// The smoothing factor (0.06) is deliberately low: it's what keeps the underlying
// white noise from reading as audible hiss once it's pushed through the convolver.
function createImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const noise = Math.random() * 2 - 1;
      lp += (noise - lp) * 0.06;
      data[i] = lp * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

let audioCtx: AudioContext | null = null;
let dryGain: GainNode | null = null;
let wetGain: GainNode | null = null;
let convolver: ConvolverNode | null = null;
let enabled = false;
let droneNodes: { gain: GainNode; oscillators: OscillatorNode[] } | null = null;
let ambientTimeoutId: ReturnType<typeof setTimeout> | null = null;

function ensureAudioGraph(): void {
  if (audioCtx) return;
  audioCtx = new AudioContext();

  dryGain = audioCtx.createGain();
  dryGain.gain.value = 0.8;
  dryGain.connect(audioCtx.destination);

  wetGain = audioCtx.createGain();
  wetGain.gain.value = 0.2;
  wetGain.connect(audioCtx.destination);

  convolver = audioCtx.createConvolver();
  convolver.buffer = createImpulseResponse(audioCtx, 2.6, 3.2);
  convolver.connect(wetGain);
}

function playTone(freq: number, decay: number, peakGain: number): void {
  if (!enabled || !audioCtx || !dryGain || !convolver) return;
  const now = audioCtx.currentTime;

  const voiceGain = audioCtx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq * 5;
  filter.Q.value = 0.3;

  voiceGain.connect(filter);
  filter.connect(dryGain);
  filter.connect(convolver);

  const partials = [
    { ratio: 1, detune: -4, gain: 0.55 },
    { ratio: 1, detune: 4, gain: 0.55 },
    { ratio: 2, detune: 0, gain: 0.2 },
    { ratio: 3, detune: 0, gain: 0.05 },
  ];

  partials.forEach((p) => {
    const osc = audioCtx!.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * p.ratio;
    osc.detune.value = p.detune;
    const pGain = audioCtx!.createGain();
    pGain.gain.value = p.gain;
    osc.connect(pGain);
    pGain.connect(voiceGain);
    osc.start(now);
    osc.stop(now + decay + 0.5);
  });

  voiceGain.gain.linearRampToValueAtTime(peakGain, now + 0.02);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
}

export function playDing(): void {
  playTone(noteToFreq(DING_NOTE), 3.2 + Math.random() * 0.6, 0.55);
}

export function playRandomNote(): void {
  const note = SCALE_NOTES[Math.floor(Math.random() * SCALE_NOTES.length)];
  playTone(noteToFreq(note), 2.2 + Math.random() * 0.8, 0.45);
}

// Slow-fading drone on the root note — grounding ambience for Gratitude.
export function startDrone(): void {
  if (!enabled || !audioCtx || !dryGain || !convolver || droneNodes) return;
  const freq = noteToFreq(DING_NOTE);
  const now = audioCtx.currentTime;

  const droneGain = audioCtx.createGain();
  droneGain.gain.setValueAtTime(0.0001, now);

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq * 4;
  filter.Q.value = 0.3;

  droneGain.connect(filter);
  filter.connect(dryGain);
  filter.connect(convolver);

  const partials = [
    { ratio: 1, detune: -3, gain: 0.5 },
    { ratio: 1, detune: 3, gain: 0.5 },
    { ratio: 0.5, detune: 0, gain: 0.3 },
    { ratio: 2, detune: 0, gain: 0.1 },
  ];

  const oscillators = partials.map((p) => {
    const osc = audioCtx!.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * p.ratio;
    osc.detune.value = p.detune;
    const pGain = audioCtx!.createGain();
    pGain.gain.value = p.gain;
    osc.connect(pGain);
    pGain.connect(droneGain);
    osc.start(now);
    return osc;
  });

  droneGain.gain.linearRampToValueAtTime(0.15, now + 3);
  droneNodes = { gain: droneGain, oscillators };
}

export function stopDrone(): void {
  if (!droneNodes || !audioCtx) return;
  const now = audioCtx.currentTime;
  const g = droneNodes.gain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(0.0001, now + 4);
  droneNodes.oscillators.forEach((osc) => osc.stop(now + 4.2));
  droneNodes = null;
}

const AMBIENT_NOTE_DELAY_RANGE_MS: [number, number] = [2200, 4200];

function scheduleAmbientNote(): void {
  const [min, max] = AMBIENT_NOTE_DELAY_RANGE_MS;
  const delay = min + Math.random() * (max - min);
  ambientTimeoutId = setTimeout(() => {
    playRandomNote();
    scheduleAmbientNote();
  }, delay);
}

export function startAmbientNotes(): void {
  if (ambientTimeoutId) return;
  scheduleAmbientNote();
}

export function stopAmbientNotes(): void {
  if (ambientTimeoutId) clearTimeout(ambientTimeoutId);
  ambientTimeoutId = null;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

// Turning sound on is the one call that must happen from a real user gesture (a click
// handler) — that's what's allowed to construct/resume the AudioContext per browser
// autoplay policy. Plays the ding immediately after, as audible confirmation that
// sound is now live rather than a silent toggle. Not persisted across full page loads
// on purpose — every fresh visit starts silent, never assumes a returning preference.
export function setSoundEnabled(next: boolean): void {
  enabled = next;

  if (!next) {
    stopDrone();
    stopAmbientNotes();
    return;
  }

  ensureAudioGraph();
  if (audioCtx!.state === "suspended") {
    void audioCtx!.resume();
  }
  playDing();
}
