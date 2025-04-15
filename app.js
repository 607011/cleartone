const fundamentalFrequency = 60;
const el = {};
const audioContext = new AudioContext;
const gainNode = audioContext.createGain();
let oscillator = null;
let rawOscillator = null;
let analyser = audioContext.createAnalyser();
analyser.fftSize = 2048;
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

async function generateAndDownloadWave(frequency, waveformType, numHarmonics, duration, sampleRate) {
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

function createSineOscillator(audioCtx, frequency) {
    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    return oscillator;
}

function createSquareOscillator(audioCtx, frequency) {
    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    return oscillator;
}

function createSawtoothOscillator(audioCtx, frequency) {
    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = frequency;
    return oscillator;
}

function createTriangleOscillator(audioCtx, frequency) {
    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    return oscillator;
}

function playWave(frequency, waveformType, numHarmonics) {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    let periodicWave;
    switch (waveformType.toLowerCase()) {
        case 'square':
            periodicWave = createSquareWavePeriodicWave(numHarmonics);
            try {
                rawOscillator.disconnect();
            } catch (e) {
                // Ignore error if not connected
            }
            rawOscillator = createSquareOscillator(audioContext, frequency);
            break;
        case 'sawtooth':
            periodicWave = createSawtoothWavePeriodicWave(numHarmonics);
            try {
                rawOscillator.disconnect();
            } catch (e) {
                // Ignore error if not connected
            }
            rawOscillator = createSawtoothOscillator(audioContext, frequency);
            break;
        case 'triangle':
            periodicWave = createTriangleWavePeriodicWave(numHarmonics);
            try {
                rawOscillator.disconnect();
            } catch (e) {
                // Ignore error if not connected
            }
            rawOscillator = createTriangleOscillator(audioContext, frequency);
            break;
        default:
            console.error('Invalid waveform type. Choose from "square", "sawtooth", or "triangle".');
            return;
    }

    oscillator = createPeriodicWaveOscillator(audioContext, frequency, periodicWave.real, periodicWave.imag);
    // (raw) oscillator -> gain -> analyser -> destination
    oscillator.connect(gainNode);
    rawOscillator.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(audioContext.destination);
    if (clearTone) {
        oscillator.start();
    }
    else {
        rawOscillator.start();
    }
}

function stopWave() {
    if (clearTone) {
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
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
    requestAnimationFrame(drawVisualizers);
}

function drawWaveform() {
    analyser.getFloatTimeDomainData(timeDomainData);
    waveformCtx.fillStyle = 'rgb(30, 36, 110)';
    waveformCtx.fillRect(0, 0, el.waveformCanvas.width, el.waveformCanvas.height);
    waveformCtx.lineWidth = 2;
    waveformCtx.strokeStyle = 'rgb(80, 102, 243)';
    waveformCtx.beginPath();
    const sliceWidth = el.waveformCanvas.width * 1.0 / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; ++i) {
        const v = timeDomainData[i] * 0.5 + 0.5; // Normalize to 0-1 range
        const y = el.waveformCanvas.height * (1 - v);
        if (i === 0) {
            waveformCtx.moveTo(x, y);
        } else {
            waveformCtx.lineTo(x, y);
        }
        x += sliceWidth;
    }
    waveformCtx.lineTo(el.waveformCanvas.width, el.waveformCanvas.height / 2);
    waveformCtx.stroke();
}

function drawFFT() {
    analyser.getByteFrequencyData(frequencyData);
    fftCtx.fillStyle = 'rgb(30, 36, 110)';
    fftCtx.fillRect(0, 0, el.fftCanvas.width, el.fftCanvas.height);
    const barWidth = (el.fftCanvas.width / bufferLength) * 2.5;
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
    drawWaveform();
    drawFFT();
    animationFrameHandle = requestAnimationFrame(drawVisualizers);
}


function main() {
    el.waveformCanvas = document.querySelector('#waveform-canvas');
    waveformCtx = el.waveformCanvas.getContext('2d');
    el.fftCanvas = document.querySelector('#fft-canvas');
    fftCtx = el.fftCanvas.getContext('2d');
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
        clearTone = e.target.checked;
        if (rawOscillator === null || oscillator === null)
            return;
        if (clearTone) {
            rawOscillator.stop();
            console.debug('Raw oscillator disabled');
            oscillator.start();
            console.debug('ClearTone enabled');
        } else {
            oscillator.stop();
            console.debug('ClearTone disabled');
            rawOscillator.start();
            console.debug('Raw oscillator enabled');
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
    el.clearTone.checked = clearTone;
}

window.addEventListener('load', main);