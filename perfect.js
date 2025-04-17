
class SquareWaveProcessor extends AudioWorkletProcessor {
    phase = 0; // Phase accumulator: 0 to 1

    static get parameterDescriptors() {
        return [{
            name: 'frequency',
            defaultValue: 440,
            minValue: 20,
            maxValue: sampleRate / 2, // Nyquist frequency
            automationRate: 'a-rate' // Audio-rate automation
        }];
    }

    process(_inputs, outputs, parameters) {
        const output = outputs[0]; // Assuming mono output
        const frequencyValues = parameters.frequency;
        output.forEach(channel => {
            for (let i = 0; i < channel.length; ++i) {
                // Get the frequency for the current sample frame.
                // If 'a-rate', use the value for this frame; otherwise, use the first value.
                const frequency = frequencyValues.length > 1 ? frequencyValues[i] : frequencyValues[0];

                // Generate square wave: +1 for phase < 0.5, -1 for phase >= 0.5
                outputChannel[i] = this.phase < 0.5 ? 1.0 : -1.0;

                // Update phase: increment by frequency / sampleRate
                this.phase += frequency / sampleRate;

                // Wrap phase around 0 to 1
                if (this.phase >= 1.0) {
                    this.phase -= 1.0;
                }
            }
        });
        return true;
    }
}

registerProcessor('perfect-square-processor', SquareWaveProcessor);
