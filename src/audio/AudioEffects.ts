export class AudioEffects {
    private audioContext: AudioContext;
    private inputNode: GainNode;
    private outputNode: GainNode;

    // EQ nodes
    private lowEQ: BiquadFilterNode;
    private midEQ: BiquadFilterNode;
    private highEQ: BiquadFilterNode;

    // Effect nodes
    private reverbNode: ConvolverNode;
    private delayNode: DelayNode;
    private filterNode: BiquadFilterNode;
    private hpfNode: BiquadFilterNode;
    private distortionNode: WaveShaperNode;
    private bitcrusherNode: WaveShaperNode;
    private flangerNode: DelayNode;
    private flangerLFO: OscillatorNode;
    private flangerGain: GainNode;
    private tremoloGain: GainNode;
    private tremoloLFO: OscillatorNode;
    private reverbGain: GainNode;
    private delayGain: GainNode;
    private distortionGain: GainNode;
    private bitcrusherGain: GainNode;
    private flangerWetGain: GainNode;
    private tremoloWetGain: GainNode;
    private dryGain: GainNode;
    private wetGain: GainNode;

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext;

        // Create nodes
        this.inputNode = audioContext.createGain();
        this.outputNode = audioContext.createGain();

        // EQ setup
        this.lowEQ = audioContext.createBiquadFilter();
        this.lowEQ.type = 'lowshelf';
        this.lowEQ.frequency.value = 250;

        this.midEQ = audioContext.createBiquadFilter();
        this.midEQ.type = 'peaking';
        this.midEQ.frequency.value = 1000;
        this.midEQ.Q.value = 1;

        this.highEQ = audioContext.createBiquadFilter();
        this.highEQ.type = 'highshelf';
        this.highEQ.frequency.value = 4000;

        // Effects setup
        this.reverbNode = audioContext.createConvolver();
        this.createReverbImpulse();

        this.delayNode = audioContext.createDelay(1);
        this.delayNode.delayTime.value = 0.3;

        this.filterNode = audioContext.createBiquadFilter();
        this.filterNode.type = 'lowpass';
        this.filterNode.frequency.value = 20000;

        this.hpfNode = audioContext.createBiquadFilter();
        this.hpfNode.type = 'highpass';
        this.hpfNode.frequency.value = 0;

        this.reverbGain = audioContext.createGain();
        this.reverbGain.gain.value = 0;

        this.delayGain = audioContext.createGain();
        this.delayGain.gain.value = 0;

        this.distortionNode = audioContext.createWaveShaper();
        this.distortionNode.curve = this.makeDistortionCurve(400);
        this.distortionNode.oversample = '4x';

        this.distortionGain = audioContext.createGain();
        this.distortionGain.gain.value = 0;

        this.bitcrusherNode = audioContext.createWaveShaper();
        this.bitcrusherNode.curve = this.makeBitcrusherCurve(4);
        this.bitcrusherGain = audioContext.createGain();
        this.bitcrusherGain.gain.value = 0;

        this.flangerNode = audioContext.createDelay();
        this.flangerNode.delayTime.value = 0.005;
        this.flangerLFO = audioContext.createOscillator();
        this.flangerLFO.frequency.value = 0.25;
        this.flangerGain = audioContext.createGain();
        this.flangerGain.gain.value = 0.002;
        this.flangerLFO.connect(this.flangerGain);
        this.flangerGain.connect(this.flangerNode.delayTime);
        this.flangerLFO.start();

        this.flangerWetGain = audioContext.createGain();
        this.flangerWetGain.gain.value = 0;

        this.tremoloGain = audioContext.createGain();
        this.tremoloLFO = audioContext.createOscillator();
        this.tremoloLFO.frequency.value = 5;
        this.tremoloWetGain = audioContext.createGain();
        this.tremoloWetGain.gain.value = 0;

        // Tremolo LFO mod
        const tremoloLFOLevel = audioContext.createGain();
        tremoloLFOLevel.gain.value = 0.5;
        this.tremoloLFO.connect(tremoloLFOLevel);
        tremoloLFOLevel.connect(this.tremoloGain.gain);
        this.tremoloLFO.start();

        this.dryGain = audioContext.createGain();
        this.dryGain.gain.value = 1;

        this.wetGain = audioContext.createGain();
        this.wetGain.gain.value = 0;

        // Connect EQ chain
        this.inputNode.connect(this.lowEQ);
        this.lowEQ.connect(this.midEQ);
        this.midEQ.connect(this.highEQ);
        this.highEQ.connect(this.filterNode);
        this.filterNode.connect(this.hpfNode);

        // Connect effects
        this.hpfNode.connect(this.dryGain);
        this.dryGain.connect(this.outputNode);

        this.hpfNode.connect(this.reverbNode);
        this.reverbNode.connect(this.reverbGain);
        this.reverbGain.connect(this.wetGain);

        this.hpfNode.connect(this.delayNode);
        this.delayNode.connect(this.delayGain);
        this.delayGain.connect(this.wetGain);

        this.hpfNode.connect(this.distortionNode);
        this.distortionNode.connect(this.distortionGain);
        this.distortionGain.connect(this.wetGain);

        this.hpfNode.connect(this.bitcrusherNode);
        this.bitcrusherNode.connect(this.bitcrusherGain);
        this.bitcrusherGain.connect(this.wetGain);

        this.hpfNode.connect(this.flangerNode);
        this.flangerNode.connect(this.flangerWetGain);
        this.flangerWetGain.connect(this.wetGain);

        this.hpfNode.connect(this.tremoloGain);
        this.tremoloGain.connect(this.tremoloWetGain);
        this.tremoloWetGain.connect(this.wetGain);

        this.wetGain.connect(this.outputNode);
    }

    private createReverbImpulse() {
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * 2;
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }

    }

    private makeBitcrusherCurve(bits: number) {
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const step = Math.pow(0.5, bits - 1);
        for (let i = 0; i < n_samples; ++i) {
            const x = i * 2 / n_samples - 1;
            curve[i] = Math.round(x / step) * step;
        }
        return curve;
    }

    private makeDistortionCurve(amount: number) {
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;

        for (let i = 0; i < n_samples; ++i) {
            const x = i * 2 / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    connect(source: AudioNode) {
        source.connect(this.inputNode);
    }

    connectToDestination(destination: AudioNode) {
        this.outputNode.connect(destination);
    }

    setEQ(band: 'low' | 'mid' | 'high', value: number) {
        const gain = (value - 50) / 10; // -5 to +5 range

        switch (band) {
            case 'low':
                this.lowEQ.gain.value = gain;
                break;
            case 'mid':
                this.midEQ.gain.value = gain;
                break;
            case 'high':
                this.highEQ.gain.value = gain;
                break;
        }
    }

    setReverb(value: number) {
        this.reverbGain.gain.value = value / 100;
        this.updateWetDryMix();
    }

    setDelay(value: number) {
        this.delayGain.gain.value = value / 100;
        this.updateWetDryMix();
    }

    setFilter(value: number) {
        // Map 0-100 to 200-20000 Hz
        const frequency = 200 + (value / 100) * 19800;
        this.filterNode.frequency.value = frequency;
        this.filterNode.frequency.value = frequency;
    }

    setDistortion(value: number) {
        this.distortionGain.gain.value = value / 100;
        this.updateWetDryMix();
    }

    setHPF(value: number) {
        // Map 0-100 to 0-10000 Hz
        const frequency = (value / 100) * 10000;
        this.hpfNode.frequency.value = frequency;
    }

    setBitcrusher(value: number) {
        this.bitcrusherGain.gain.value = value / 100;
        this.updateWetDryMix();
    }

    setFlanger(value: number) {
        this.flangerWetGain.gain.value = value / 100;
        this.updateWetDryMix();
    }

    setTremolo(value: number) {
        this.tremoloWetGain.gain.value = value / 100;
        this.updateWetDryMix();
    }

    private updateWetDryMix() {
        const totalWet = this.reverbGain.gain.value +
            this.delayGain.gain.value +
            this.distortionGain.gain.value +
            this.bitcrusherGain.gain.value +
            this.flangerWetGain.gain.value +
            this.tremoloWetGain.gain.value;
        this.wetGain.gain.value = Math.min(totalWet, 1);
        this.dryGain.gain.value = Math.max(0, 1 - totalWet * 0.5);
    }

    disconnect() {
        this.inputNode.disconnect();
        this.outputNode.disconnect();
    }
}
