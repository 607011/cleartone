const fundamentalFrequency = 60;
const el = {};
const audioContext = new AudioContext;
const gainNode = audioContext.createGain();
let clearOscillator = null;
let rawOscillator = null;
let analyser = audioContext.createAnalyser();
analyser.fftSize = 8192;
const bufferLength = analyser.fftSize;
const timeDomainData = new Float32Array(bufferLength);
const frequencyData = new Uint8Array(analyser.frequencyBinCount);
let waveformCtx = null;
let fftCtx = null;
let clearTone = true;
let animationFrameHandle;

function setGainDbFS(node, dbFS) {
    // Convert dBFS to linear gain: gain = 10^(dBFS / 20)
    const linearGain = Math.pow(10, dbFS / 20);
    node.gain.value = linearGain;
}

async function generateAndDownloadWave() {
    const sampleRate = parseInt(el.sampleRate.value, 10);
    const duration = parseFloat(el.duration.value);
    const offlineAudioContext = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
    const oscillator = clearTone
        ? createClearToneOscillator(offlineAudioContext, parseFloat(el.frequency.value), el.waveform.value, parseInt(el.harmonics.value, 10))
        : createRawOscillator(offlineAudioContext, parseFloat(el.frequency.value), el.waveform.value);
    const gainNode = offlineAudioContext.createGain();
    setGainDbFS(gainNode, parseFloat(el.gain.value));
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
        a.download = `${el.waveform.value}_${el.frequency.value}Hz_${el.harmonics.value}harmonics_${sampleRate}sps.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    catch (error) {
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
    for (let i = 1; i <= numHarmonics; ++i) {
        const harmonicNumber = 2 * i - 1; // Odd harmonics
        imag[harmonicNumber] = 4 / (Math.PI * harmonicNumber);
    }
    return { real, imag };
}

function createSawtoothWavePeriodicWave(numHarmonics) {
    const real = new Float32Array(numHarmonics + 1);
    const imag = new Float32Array(numHarmonics + 1);
    for (let n = 1; n <= numHarmonics; ++n) {
        imag[n] = (2 / (Math.PI * n)) * (n % 2 === 0 ? -1 : 1);
    }
    return { real, imag };
}

function createTriangleWavePeriodicWave(numHarmonics) {
    const real = new Float32Array(numHarmonics * 2 + 1);
    const imag = new Float32Array(numHarmonics * 2 + 1);
    for (let k = 0; k < numHarmonics; ++k) {
        const n = 2 * k + 1;
        imag[n] = (8 / (Math.PI * Math.PI * n * n)) * (k % 2 === 0 ? 1 : -1);
    }
    return { real, imag };
}

function createRawOscillator(audioCtx, frequency, waveformType) {
    const oscillator = audioCtx.createOscillator();
    oscillator.type = waveformType;
    oscillator.frequency.value = frequency;
    return oscillator;
}

async function createStochasticNoiseGenerator(audioContext, color) {
    try {
        await audioContext.audioWorklet.addModule('noise.js');
        const noiseNode = new AudioWorkletNode(audioContext, `${color}-noise-processor`);
        return noiseNode;
    } catch (error) {
        console.error('Error loading audio worklet:', error);
        return null;
    }
}

function createClearToneOscillator(audioCtx, frequency, waveformType, numHarmonics) {
    switch (waveformType) {
        case 'sine':
            periodicWave = createSquareWavePeriodicWave(1);
            break;
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
    return createPeriodicWaveOscillator(audioCtx, frequency, periodicWave.real, periodicWave.imag);
}

async function createAndSetupClearToneOscillator(audioCtx) {
    if (clearOscillator) {
        clearOscillator.disconnect();
        clearOscillator = null;
    }
    if (el.waveform.value.includes('noise')) {
        const noiseColor = el.waveform.value.split('-')[0]; // Extract color like 'white' from 'white-noise'
        return createStochasticNoiseGenerator(audioCtx, noiseColor).then((oscillator) => {
            if (!oscillator) {
                console.error(`Failed to create ${noiseColor}-noise generator.`);
                return null; // Indicate failure
            }
            clearOscillator = oscillator;
            clearOscillator.connect(gainNode);
            return clearOscillator;
        });
    }
    clearOscillator = createClearToneOscillator(audioCtx, parseFloat(el.frequency.value), el.waveform.value, parseInt(el.harmonics.value, 10));
    clearOscillator.connect(gainNode);
    return Promise.resolve(clearOscillator);
}

function createAndSetupRawOscillator(audioCtx) {
    if (rawOscillator) {
        rawOscillator.disconnect();
        rawOscillator = null;
    }
    rawOscillator = createRawOscillator(audioCtx, parseFloat(el.frequency.value), el.waveform.value);
    rawOscillator.connect(gainNode);
    return Promise.resolve(rawOscillator);
}

function playWave() {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    gainNode.connect(analyser);
    analyser.connect(audioContext.destination);
    const oscillatorPromise = clearTone ?
        createAndSetupClearToneOscillator(audioContext) :
        createAndSetupRawOscillator(audioContext);
    oscillatorPromise.then(oscillator => {
        if (oscillator) {
            try {
                oscillator.start();
            } catch (error) {
            }
        } else {
            console.error('Failed to create oscillator');
        }
    }).catch(error => {
        console.error('Error creating oscillator:', error);
    });
}

function stopWave() {
    if (clearTone) {
        if (clearOscillator) {
            try {
                clearOscillator.stop();
            } catch (error) {
            }
            clearOscillator.disconnect();
            clearOscillator = null;
        }
    }
    else {
        if (rawOscillator) {
            rawOscillator.stop();
            rawOscillator.disconnect();
            rawOscillator = null;
        }
    }
    cancelAnimationFrame(animationFrameHandle);
    waveformCtx.clearRect(0, 0, el.waveform.width, el.waveform.height);
}

function play() {
    const frequency = parseFloat(el.frequency.value);
    const numHarmonics = parseInt(el.harmonics.value, 10);
    const waveformType = el.waveform.value;
    stopWave();
    playWave(frequency, waveformType, numHarmonics);
    animationFrameHandle = requestAnimationFrame(drawVisualizers);
}

function findZeroCrossing(timeDomainData) {
    for (let i = 0; i < bufferLength - 1; ++i) {
        if (timeDomainData[i] < 0 && timeDomainData[i + 1] >= 0) {
            return i;
        }
    }
    return 0;
}

function drawWave() {
    analyser.getFloatTimeDomainData(timeDomainData);
    waveformCtx.fillStyle = 'rgb(30, 36, 110)';
    waveformCtx.fillRect(0, 0, el.waveformCanvas.width, el.waveformCanvas.height);
    waveformCtx.strokeStyle = 'rgb(58, 66, 148)';
    waveformCtx.lineWidth = 1;
    const halfHeight = el.waveformCanvas.height / 2;
    for (let y = 0; y < halfHeight; y += halfHeight / 5) {
        waveformCtx.beginPath();
        waveformCtx.strokeStyle = (y === 0) ? 'rgb(114, 121, 203)' : 'rgb(58, 66, 148)';
        waveformCtx.moveTo(0, y);
        waveformCtx.lineTo(el.waveformCanvas.width, y);
        waveformCtx.moveTo(0, y + halfHeight);
        waveformCtx.lineTo(el.waveformCanvas.width, y + halfHeight);
        waveformCtx.stroke();
    }
    if (!el.frequency) 
        return;
    waveformCtx.lineWidth = 1.5;
    waveformCtx.strokeStyle = 'rgb(80, 102, 243)';
    waveformCtx.beginPath();
    const sampleWidth = el.waveformCanvas.width / bufferLength;
    const startIndex = findZeroCrossing(timeDomainData);
    let x = 0;
    for (let i = startIndex; i < bufferLength; ++i) {
        const dataIndex = i;
        const v = timeDomainData[dataIndex] * 0.5 + 0.5;
        const y = el.waveformCanvas.height * (1 - v);
        if (i === 0) {
            waveformCtx.moveTo(x, y);
        } else {
            waveformCtx.lineTo(x, y);
        }
        x += sampleWidth;
    }
    waveformCtx.stroke();
}

function drawFFT() {
    analyser.getByteFrequencyData(frequencyData);
    fftCtx.fillStyle = 'rgb(30, 36, 110)';
    fftCtx.fillRect(0, 0, el.fftCanvas.width, el.fftCanvas.height);
    fftCtx.strokeStyle = 'rgb(58, 66, 148)';
    fftCtx.lineWidth = 1;
    fftCtx.beginPath();
    for (let y = 0; y < el.fftCanvas.height; y += el.fftCanvas.height / 10) {
        fftCtx.moveTo(0, y);
        fftCtx.lineTo(el.fftCanvas.width, y);
    }
    fftCtx.stroke();
    const barWidth = 1;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
        const normFrequency = frequencyData[i] / 255;
        const barHeight = normFrequency * el.fftCanvas.height;
        fftCtx.fillStyle = `rgb(80, 102, 243)`;
        fftCtx.fillRect(x, el.fftCanvas.height - barHeight / 2, barWidth, barHeight / 2);
        x += barWidth + 1;
    }
}

function drawVisualizers() {
    drawWave();
    drawFFT();
    animationFrameHandle = requestAnimationFrame(drawVisualizers);
}

function main() {
    el.waveformCanvas = document.querySelector('#waveform-canvas');
    waveformCtx = el.waveformCanvas.getContext('2d');
    el.fftCanvas = document.querySelector('#fft-canvas');
    fftCtx = el.fftCanvas.getContext('2d');
    drawWave();
    drawFFT();
    el.play = document.querySelector('button#play');
    el.frequency = document.querySelector('#frequency');
    el.harmonics = document.querySelector('#harmonics');
    el.waveform = document.querySelector('#waveform');
    el.duration = document.querySelector('#duration');
    el.save = document.querySelector('button#save');
    el.sampleRate = document.querySelector('#sample-rate');
    el.gainValue = document.querySelector('#gain-value');
    el.gain = document.querySelector('#gain');
    el.clearTone = document.querySelector('#cleartone');
    el.clearTone.addEventListener('input', e => {
        if (!clearTone && rawOscillator !== null) {
            rawOscillator.stop();
            rawOscillator = null;
        }
        if (clearTone && clearOscillator !== null) {
            clearOscillator.stop();
            clearOscillator = null;
        }
        clearTone = e.target.checked;
        if (el.play.textContent === 'Stop') {
            if (clearTone) {
                createAndSetupClearToneOscillator(audioContext);
                clearOscillator.start();
            }
            else {
                createAndSetupRawOscillator(audioContext);
                rawOscillator.start();
            }
        }
    });
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
    setGainDbFS(gainNode, parseFloat(el.gain.value));

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
    el.waveform.addEventListener('change', () => {
        if (el.play.textContent === 'Stop') {
            play();
        }
    });
    el.save.addEventListener('click', generateAndDownloadWave);
    el.frequency.value = fundamentalFrequency;
    el.harmonics.value = 15;
    el.waveform.value = 'square';
    el.clearTone.checked = clearTone;
}

window.addEventListener('load', main);