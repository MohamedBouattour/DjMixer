/**
 * Scratch Processor AudioWorklet
 * 
 * This processor handles sample-accurate audio playback with scratching support.
 * It uses Hermite (Cubic) interpolation for high-quality variable-speed playback.
 */
class ScratchProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            {
                name: 'playbackRate',
                defaultValue: 0, // 0 = stopped, 1 = normal speed
                minValue: -5.0,
                maxValue: 5.0,
                automationRate: 'k-rate' // We don't need per-sample changes
            },
            {
                name: 'isScratching', // 0 or 1
                defaultValue: 0,
                minValue: 0,
                maxValue: 1,
                automationRate: 'k-rate'
            },
            {
                name: 'scratchVelocity', // The hand-controlled velocity
                defaultValue: 0,
                automationRate: 'a-rate' // Per-sample for smooth scratching
            }
        ];
    }

    constructor() {
        super();
        this.buffer = null;
        this.position = 0; // Current sample position (float for sub-sample accuracy)
        this.sampleCounter = 0;

        // Motor simulation (for realistic vinyl spin-up/down)
        this.currentVelocity = 0;
        this.motorStrength = 0.05; // How fast the motor pulls toward target speed

        // Listen for messages from main thread
        this.port.onmessage = (event) => {
            if (event.data.type === 'load-buffer') {
                this.buffer = event.data.buffer; // Float32Array[]
                this.position = 0;
                this.currentVelocity = 0;
            } else if (event.data.type === 'seek') {
                this.position = event.data.position;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelCount = output.length;

        if (!this.buffer || !this.buffer[0]) {
            return true;
        }

        // Read parameter values (k-rate = single value per block)
        const isScratching = parameters.isScratching[0] >= 0.5;
        const targetRate = parameters.playbackRate[0];
        const scratchVelocityArray = parameters.scratchVelocity;

        const bufferLength = this.buffer[0].length;

        for (let i = 0; i < output[0].length; i++) {
            // Determine the effective rate for this sample
            let rate;

            if (isScratching) {
                // Use hand-controlled velocity (a-rate for smooth scratching)
                rate = scratchVelocityArray.length > 1
                    ? scratchVelocityArray[i]
                    : scratchVelocityArray[0];

                // Immediately apply hand velocity
                this.currentVelocity = rate;
            } else {
                // Motor simulation: smoothly interpolate toward target rate
                // This creates the realistic "spin-up" and "spin-down" effect
                const diff = targetRate - this.currentVelocity;
                this.currentVelocity += diff * this.motorStrength;

                // Snap to target if very close (avoid endless tiny movements)
                if (Math.abs(diff) < 0.001) {
                    this.currentVelocity = targetRate;
                }

                rate = this.currentVelocity;
            }

            // Update position
            this.position += rate;

            // Boundary handling
            if (this.position >= bufferLength) {
                this.position = bufferLength - 1;
                this.currentVelocity = 0; // Stop at end
            } else if (this.position < 0) {
                this.position = 0;
                this.currentVelocity = 0; // Stop at beginning
            }

            // Hermite (Cubic) Interpolation for high-quality playback
            const index = Math.floor(this.position);
            const fraction = this.position - index;

            for (let channel = 0; channel < channelCount; channel++) {
                const bufferChannel = this.buffer[channel] || this.buffer[0];
                const length = bufferChannel.length;

                // Get 4 samples for cubic interpolation
                const i0 = Math.max(0, Math.min(length - 1, index - 1));
                const i1 = Math.max(0, Math.min(length - 1, index));
                const i2 = Math.max(0, Math.min(length - 1, index + 1));
                const i3 = Math.max(0, Math.min(length - 1, index + 2));

                const y0 = bufferChannel[i0];
                const y1 = bufferChannel[i1];
                const y2 = bufferChannel[i2];
                const y3 = bufferChannel[i3];

                // Hermite coefficients
                const c0 = y1;
                const c1 = 0.5 * (y2 - y0);
                const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
                const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);

                output[channel][i] = ((c3 * fraction + c2) * fraction + c1) * fraction + c0;
            }
        }

        // Send position sync to main thread (every ~100ms)
        this.sampleCounter += output[0].length;
        if (this.sampleCounter >= 4410) { // ~100ms at 44.1kHz
            this.sampleCounter = 0;
            this.port.postMessage({
                type: 'position',
                position: this.position,
                velocity: this.currentVelocity,
                bufferLen: bufferLength
            });
        }

        return true;
    }
}

registerProcessor('scratch-processor', ScratchProcessor);
