/**
 * Sample-accurate deck player for DJ Pro Master.
 *
 * A plain AudioBufferSourceNode cannot play backwards and its playbackRate
 * changes are smoothed by the browser, which makes real scratching impossible.
 * This processor instead reads from the decoded track with its own fractional
 * playhead, so the rate can be changed per render quantum and can go negative
 * for reverse/backspin.
 */
class DeckProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** @type {Float32Array[]} decoded channel data */
    this.channels = [];
    this.frames = 0;
    this.sampleRate_ = sampleRate;

    this.position = 0.0; // fractional frame index
    this.rate = 1.0; // target rate, may be negative while scratching
    this.currentRate = 1.0; // smoothed rate actually applied
    this.playing = false;
    this.scratching = false;
    this.gain = 1.0;
    this.loopStart = -1;
    this.loopEnd = -1;

    this._reportCounter = 0;

    this.port.onmessage = (e) => this._onMessage(e.data);
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'load':
        this.channels = msg.channels.map((c) => new Float32Array(c));
        this.frames = this.channels.length ? this.channels[0].length : 0;
        this.sampleRate_ = msg.sampleRate || sampleRate;
        this.position = 0;
        this.playing = false;
        this._report(true);
        break;
      case 'play':
        if (this.frames > 0) this.playing = true;
        break;
      case 'pause':
        this.playing = false;
        break;
      case 'seek':
        this.position = Math.max(0, Math.min(this.frames - 1, msg.frame));
        this._report(true);
        break;
      case 'rate':
        this.rate = msg.rate;
        break;
      case 'scratch':
        // While scratching the rate follows the jog wheel exactly, with no
        // smoothing, so the sound tracks the hand.
        this.scratching = msg.active;
        if (msg.active) {
          this.rate = msg.rate;
          this.currentRate = msg.rate;
        }
        break;
      case 'gain':
        this.gain = msg.gain;
        break;
      case 'loop':
        this.loopStart = msg.start;
        this.loopEnd = msg.end;
        break;
      case 'unload':
        this.channels = [];
        this.frames = 0;
        this.playing = false;
        break;
    }
  }

  _report(force) {
    // ~30 position updates per second is plenty for the UI.
    if (!force && ++this._reportCounter < 4) return;
    this._reportCounter = 0;
    this.port.postMessage({
      type: 'pos',
      frame: this.position,
      frames: this.frames,
      playing: this.playing,
      rate: this.currentRate,
    });
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const outL = output[0];
    const outR = output.length > 1 ? output[1] : null;
    const n = outL.length;

    if (!this.playing || this.frames === 0 || this.channels.length === 0) {
      outL.fill(0);
      if (outR) outR.fill(0);
      return true;
    }

    const chL = this.channels[0];
    const chR = this.channels.length > 1 ? this.channels[1] : chL;

    // Ease towards the target rate when not scratching, so pitch-fader moves
    // and play/pause do not click. Scratching applies the rate immediately.
    const smoothing = this.scratching ? 1.0 : 0.15;

    for (let i = 0; i < n; i++) {
      this.currentRate += (this.rate - this.currentRate) * smoothing;
      const rate = this.currentRate;

      let pos = this.position;

      // Loop wrap-around, honouring direction.
      if (this.loopStart >= 0 && this.loopEnd > this.loopStart) {
        const len = this.loopEnd - this.loopStart;
        if (pos >= this.loopEnd) pos -= len;
        else if (pos < this.loopStart) pos += len;
      }

      if (pos < 0) {
        pos = 0;
        this.playing = false;
      } else if (pos >= this.frames - 1) {
        pos = this.frames - 1;
        this.playing = false;
      }

      // Linear interpolation between neighbouring frames.
      const i0 = pos | 0;
      const i1 = i0 + 1 < this.frames ? i0 + 1 : i0;
      const frac = pos - i0;

      const l = chL[i0] + (chL[i1] - chL[i0]) * frac;
      const r = chR[i0] + (chR[i1] - chR[i0]) * frac;

      outL[i] = l * this.gain;
      if (outR) outR[i] = r * this.gain;

      this.position = pos + rate;
    }

    this._report(false);
    return true;
  }
}

registerProcessor('dj-deck-processor', DeckProcessor);
