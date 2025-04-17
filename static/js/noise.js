class WhiteNoiseProcessor extends AudioWorkletProcessor {
    process(_inputs, outputs, _parameters) {
        const output = outputs[0];
        output.forEach(channel => {
            for (let i = 0; i < channel.length; ++i) {
                channel[i] = Math.random() * 2 - 1;
            }
        });
        return true; // Keep the processor running
    }
}

class BrownNoiseProcessor extends AudioWorkletProcessor {
    lastOut = 0.0;
    process(_inputs, outputs, _parameters) {
        const output = outputs[0];
        output.forEach(channel => {
            for (let i = 0; i < channel.length; ++i) {
                const white = Math.random() * 2 - 1;
                channel[i] = (this.lastOut + (0.02 * white)) / 1.02;
                this.lastOut = channel[i];
                channel[i] *= 3.5; // Adjust gain
            }
        });
        return true;
    }
}

// Simple approximation of Pink Noise using the Voss-McCartney algorithm
class PinkNoiseProcessor extends AudioWorkletProcessor {
    b0 = 0; b1 = 0; b2 = 0; b3 = 0; b4 = 0; b5 = 0; b6 = 0;
    process(_inputs, outputs, _parameters) {
        const output = outputs[0];
        output.forEach(channel => {
            for (let i = 0; i < channel.length; ++i) {
                const white = Math.random() * 2 - 1;
                this.b0 = 0.99886 * this.b0 + white * 0.0555179;
                this.b1 = 0.99332 * this.b1 + white * 0.0750759;
                this.b2 = 0.96900 * this.b2 + white * 0.1538520;
                this.b3 = 0.86650 * this.b3 + white * 0.3104856;
                this.b4 = 0.55000 * this.b4 + white * 0.5329522;
                this.b5 = -0.7616 * this.b5 - white * 0.0168980;
                channel[i] = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
                channel[i] *= 0.11; // Adjust gain
                this.b6 = white * 0.115926;
            }
        });
        return true;
    }
}

class AMRadioNoiseProcessor extends AudioWorkletProcessor {
    // Filter coefficients for AM radio frequency response
    lowpassA = [0.7, 0.2];
    lowpassB = [0.3];

    // State variables for the filter
    xHistory = [0, 0];
    yHistory = [0];

    // Crackling/interference variables
    crackleProb = 0.03;       // Probability of a crackle
    crackleCounter = 0;       // Counter for crackle duration
    crackleIntensity = 0;     // Current crackle intensity
    interferencePhase = 0;    // Phase for interference pattern

    process(_inputs, outputs, _parameters) {
        const output = outputs[0];
        output.forEach(channel => {
            for (let i = 0; i < channel.length; ++i) {
                // Base white noise (static)
                let noise = Math.random() * 2 - 1;

                // Apply simple IIR filter to shape the frequency response like AM radio
                // Move old samples down
                this.xHistory[1] = this.xHistory[0];
                this.xHistory[0] = noise;

                // Calculate filtered output
                let y = this.lowpassB[0] * this.yHistory[0] +
                    this.lowpassA[0] * this.xHistory[0] +
                    this.lowpassA[1] * this.xHistory[1];

                // Store output for next iteration
                this.yHistory[0] = y;

                // Random crackles/pops (characteristic of AM radio)
                if (Math.random() < this.crackleProb && this.crackleCounter === 0) {
                    this.crackleCounter = Math.floor(Math.random() * 1500) + 100;
                    this.crackleIntensity = Math.random() * 0.7 + 0.3;
                }

                if (this.crackleCounter > 0) {
                    const crackleEnvelope = Math.min(1, this.crackleCounter / 100) *
                        this.crackleIntensity;
                    y += (Math.random() * 2 - 1) * crackleEnvelope;
                    --this.crackleCounter;
                }

                // Add periodic interference (simulate distant stations/electrical interference)
                this.interferencePhase += 0.00005;
                if (this.interferencePhase > 1) this.interferencePhase -= 1;

                const interference = Math.sin(this.interferencePhase * 2 * Math.PI * 60) *
                    Math.sin(this.interferencePhase * 2 * Math.PI * 15) * 0.15;

                // Combine all elements
                channel[i] = y * 0.6 + interference;

                // Soft clipping for that "warm" AM sound
                if (channel[i] > 0.8) channel[i] = 0.8 + (channel[i] - 0.8) * 0.5;
                if (channel[i] < -0.8) channel[i] = -0.8 + (channel[i] + 0.8) * 0.5;
            }
        });

        return true;
    }
}

registerProcessor('am-noise-processor', AMRadioNoiseProcessor);
registerProcessor('white-noise-processor', WhiteNoiseProcessor);
registerProcessor('brown-noise-processor', BrownNoiseProcessor);
registerProcessor('pink-noise-processor', PinkNoiseProcessor);
