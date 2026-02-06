class ScratchProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            {
                name: 'playbackRate',
                defaultValue: 1.0,
                minValue: -5.0,
                maxValue: 5.0
            },
            {
                name: 'isScratching', // 0 or 1
                defaultValue: 0,
                minValue: 0,
                maxValue: 1
            },
            {
                name: 'scratchVelocity',
                defaultValue: 0
            }
        ];
    }

    constructor() {
        super();
        this.buffer = null;
        this.position = 0; // Current sample position

        // Listen for the buffer data
        this.port.onmessage = (event) => {
            if (event.data.type === 'load-buffer') {
                this.buffer = event.data.buffer; // Float32Array[]
                this.position = 0;
            } else if (event.data.type === 'seek') {
                this.position = event.data.position;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelCount = output.length;

        if (!this.buffer) {
            return true;
        }

        const playbackRate = parameters.playbackRate;
        const isScratching = parameters.isScratching;
        const scratchVelocity = parameters.scratchVelocity;

        // We assume stereo or mono buffer
        // this.buffer is an array of Float32Arrays [channel0, channel1, ...]

        for (let i = 0; i < output[0].length; i++) {
            // Determine speed for this sample
            // If dragging/scratching, velocity comes from physics or hand
            // If playing normal, rate is 1.0 (or pitch adjusted)

            // AudioParam array values (a-rate) or single value (k-rate)
            const rate = isScratching.length > 1 ? isScratching[i] : isScratching[0] === 1
                ? (scratchVelocity.length > 1 ? scratchVelocity[i] : scratchVelocity[0])
                : (playbackRate.length > 1 ? playbackRate[i] : playbackRate[0]);

            // Update position
            this.position += rate;

            // Loop logic (if applicable) or clamp
            // Standard DJ deck behavior: stop at end, maybe loop if loop active (add later)
            if (this.position >= this.buffer[0].length) {
                this.position = this.buffer[0].length - 1;
                // Stop?
            } else if (this.position < 0) {
                this.position = 0;
            }

            // Read from buffer with Linear Interpolation
            const floorPos = Math.floor(this.position);
            const ceilPos = Math.ceil(this.position);
            const fraction = this.position - floorPos;

            for (let channel = 0; channel < channelCount; channel++) {
                const bufferChannel = this.buffer[channel] || this.buffer[0]; // fallback to mono if needed

                // Safety check
                if (floorPos >= bufferChannel.length) {
                    output[channel][i] = 0;
                    continue;
                }

                const s1 = bufferChannel[floorPos] || 0;
                const s2 = bufferChannel[ceilPos] || 0;

                // Simple Linear Interpolation
                // Todo: upgrade to Hermite or Sinc for "Heavy" physics later
                output[channel][i] = s1 + (s2 - s1) * fraction;
            }
        }

        return true;
    }
}

registerProcessor('scratch-processor', ScratchProcessor);
