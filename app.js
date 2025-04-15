const fundamentalFrequency = 1000;
const el = {};
const audioContext = new AudioContext;
const gainNode = audioContext.createGain();
let oscillator = null;

function setGainDbFS(node, dbFS) {
    // Convert dBFS to linear gain: gain = 10^(dBFS / 20)
    const linearGain = Math.pow(10, dbFS / 20);
    node.gain.value = linearGain;
}

async function generateAndDownloadWave(frequency, waveformType, numHarmonics, duration, sampleRate) {
    console.debug(`Generating ${waveformType} wave at ${frequency}Hz with ${numHarmonics} harmonics for ${duration}s at ${sampleRate}Hz`);
    const offlineAudioContext = new OfflineAudioContext(1, sampleRate * duration, sampleRate);

    let periodicWave;
    switch (waveformType.toLowerCase()) {
        case 'square':
            periodicWave = createSquareWavePeriodicWave(numHarmonics);
            break;
        case 'sawtooth':
            periodicWave = createSawtoothWavePeriodicWave(numHarmonics);
            break;
        case 'triangle':
            periodicWave = createTriangleWavePeriodicWave(numHarmonics);
            break;
        default:
            console.error('Invalid waveform type.');
            return;
    }

    const oscillator = createPeriodicWaveOscillator(offlineAudioContext, frequency, periodicWave.real, periodicWave.imag);
    const gainNode = offlineAudioContext.createGain();
    setGainDbFS(gainNode, -6);
    oscillator.connect(gainNode);
    gainNode.connect(offlineAudioContext.destination);
    oscillator.start();
    oscillator.stop(duration);

    try {
        const audioBuffer = await offlineAudioContext.startRendering();
        const audioData = audioBuffer.getChannelData(0); // Get the mono audio data

        // Convert to 32-bit float (4 bytes per sample)
        const dataLength = audioData.length * 4; // 4 bytes per sample for 32-bit float
        const buffer = new ArrayBuffer(dataLength);
        const view = new DataView(buffer);
        let offset = 0;
        for (let i = 0; i < audioData.length; i++) {
            view.setFloat32(offset, audioData[i], true); // Little endian
            offset += 4;
        }

        // Create a WAV file
        const waveBuffer = createWaveFile(view, sampleRate, 1, 32); // 32 bits per sample
        const blob = new Blob([waveBuffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${waveformType}_${frequency}Hz_${numHarmonics}harmonics_${sampleRate}sps.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error('Rendering failed:', error);
    }
}

function createWaveFile(dataView, sampleRate, channels, bitsPerSample) {
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    const buffer = new ArrayBuffer(44 + dataView.byteLength);
    const view = new DataView(buffer);

    /* RIFF chunk */
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataView.byteLength, true); // ChunkSize
    view.setUint32(8, 0x57415645, false); // "WAVE"

    /* fmt sub-chunk */
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 3, true); // AudioFormat (IEEE float = 3)
    view.setUint16(22, channels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, byteRate, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, bitsPerSample, true); // BitsPerSample

    /* data sub-chunk */
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataView.byteLength, true); // Subchunk2Size

    // Copy the 32-bit float data directly
    const dataBytes = new Uint8Array(dataView.buffer);
    const outputBytes = new Uint8Array(buffer, 44);
    outputBytes.set(dataBytes);

    return buffer;
}


function createPeriodicWaveOscillator(audioCtx, frequency, realCoeffs, imagCoeffs) {
    const oscillator = audioCtx.createOscillator();
    const periodicWave = audioCtx.createPeriodicWave(realCoeffs, imagCoeffs);
    oscillator.setPeriodicWave(periodicWave);
    oscillator.frequency.value = frequency;
    return oscillator;
}

function createSquareWavePeriodicWave(numHarmonics) {
    const real = new Float32Array(numHarmonics * 2);
    const imag = new Float32Array(numHarmonics * 2);
    for (let i = 1; i <= numHarmonics; i++) {
        const harmonicNumber = 2 * i - 1; // Odd harmonics
        imag[harmonicNumber] = 4 / (Math.PI * harmonicNumber);
    }
    return { real, imag };
}

function createSawtoothWavePeriodicWave(numHarmonics) {
    const real = new Float32Array(numHarmonics * 2);
    const imag = new Float32Array(numHarmonics * 2);
    for (let n = 1; n <= numHarmonics; n++) {
        imag[n] = (2 / (Math.PI * n)) * (n % 2 === 0 ? -1 : 1);
    }
    return { real, imag };
}

function createTriangleWavePeriodicWave(numHarmonics) {
    const real = new Float32Array(numHarmonics * 2);
    const imag = new Float32Array(numHarmonics * 2);
    for (let k = 0; k < numHarmonics; k++) {
        const n = 2 * k + 1;
        imag[n] = (8 / (Math.PI * Math.PI * n * n)) * (k % 2 === 0 ? 1 : -1);
    }
    return { real, imag };
}

function playWave(frequency, waveformType, numHarmonics) {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    let periodicWave;
    switch (waveformType.toLowerCase()) {
        case 'square':
            periodicWave = createSquareWavePeriodicWave(numHarmonics);
            break;
        case 'sawtooth':
            periodicWave = createSawtoothWavePeriodicWave(numHarmonics);
            break;
        case 'triangle':
            periodicWave = createTriangleWavePeriodicWave(numHarmonics);
            break;
        default:
            console.error('Invalid waveform type. Choose from "square", "sawtooth", or "triangle".');
            return;
    }

    oscillator = createPeriodicWaveOscillator(audioContext, frequency, periodicWave.real, periodicWave.imag);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
}

function stopWave() {
    if (oscillator) {
        oscillator.stop();
        oscillator.disconnect();
        oscillator = null;
    }
}

function play() {
    const frequency = parseFloat(el.frequency.value);
    const numHarmonics = parseInt(el.harmonics.value, 10);
    const waveformType = el.waveform.value;
    stopWave();
    playWave(frequency, waveformType, numHarmonics);
}

function main() {
    el.play = document.querySelector('button#play');
    el.frequency = document.querySelector('#frequency');
    el.harmonics = document.querySelector('#harmonics');
    el.waveform = document.querySelector('#waveform');
    el.duration = document.querySelector('#duration');
    el.save = document.querySelector('button#save');
    el.sampleRate = document.querySelector('#sample-rate');
    el.gainValue = document.querySelector('#gain-value');
    el.gain = document.querySelector('#gain');
    el.play.addEventListener('click', () => {
        if (el.play.textContent === 'Play') {
            el.play.textContent = 'Stop';
            play();
        } else {
            el.play.textContent = 'Play';
            stopWave();
        }
    });
    el.gain.addEventListener('input', () => {
        const gain = parseFloat(el.gain.value);
        if (isNaN(gain) || gain > 0) {
            el.gain.value = -3;
        }
        el.gainValue.textContent = gain.toFixed(1);
        setGainDbFS(gainNode, parseFloat(el.gain.value));
    });
    el.gainValue.textContent = el.gain.value;

    el.frequency.addEventListener('input', () => {
        const frequency = parseFloat(el.frequency.value);
        if (isNaN(frequency) || frequency <= 0) {
            el.frequency.value = fundamentalFrequency;
        }
        if (el.play.textContent === 'Stop') {
            play();
        }
    });
    el.harmonics.addEventListener('input', () => {
        const numHarmonics = parseInt(el.harmonics.value, 10);
        if (isNaN(numHarmonics) || numHarmonics <= 0) {
            el.harmonics.value = 15;
        }
        if (el.play.textContent === 'Stop') {
            play();
        }
    });
    el.waveform.addEventListener('input', () => {
        const waveformType = el.waveform.value;
        if (!['square', 'sawtooth', 'triangle'].includes(waveformType)) {
            el.waveform.value = 'square';
        }
        if (el.play.textContent === 'Stop') {
            play();
        }
    });
    el.save.addEventListener('click', () => {
        generateAndDownloadWave(
            parseFloat(el.frequency.value),
            el.waveform.value,
            parseInt(el.harmonics.value, 10),
            parseFloat(el.duration.value),
            parseInt(el.sampleRate.value, 10)
        );
    });
    el.frequency.value = fundamentalFrequency;
    el.harmonics.value = 15;
    el.waveform.value = 'square';
}

window.addEventListener('load', main);