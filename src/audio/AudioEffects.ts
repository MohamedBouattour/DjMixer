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
    private reverbGain: GainNode;
    private delayGain: GainNode;
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

        this.reverbGain = audioContext.createGain();
        this.reverbGain.gain.value = 0;

        this.delayGain = audioContext.createGain();
        this.delayGain.gain.value = 0;

        this.dryGain = audioContext.createGain();
        this.dryGain.gain.value = 1;

        this.wetGain = audioContext.createGain();
        this.wetGain.gain.value = 0;

        // Connect EQ chain
        this.inputNode.connect(this.lowEQ);
        this.lowEQ.connect(this.midEQ);
        this.midEQ.connect(this.highEQ);
        this.highEQ.connect(this.filterNode);

        // Connect effects
        this.filterNode.connect(this.dryGain);
        this.dryGain.connect(this.outputNode);

        this.filterNode.connect(this.reverbNode);
        this.reverbNode.connect(this.reverbGain);
        this.reverbGain.connect(this.wetGain);

        this.filterNode.connect(this.delayNode);
        this.delayNode.connect(this.delayGain);
        this.delayGain.connect(this.wetGain);

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

        this.reverbNode.buffer = impulse;
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
    }

    private updateWetDryMix() {
        const totalWet = this.reverbGain.gain.value + this.delayGain.gain.value;
        this.wetGain.gain.value = Math.min(totalWet, 1);
        this.dryGain.gain.value = Math.max(0, 1 - totalWet * 0.5);
    }

    disconnect() {
        this.inputNode.disconnect();
        this.outputNode.disconnect();
    }
}
