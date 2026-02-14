// Synthwave Layers - Main Application Logic
// Built with Tone.js for audio synthesis

// ============================================================================
// MOOD PROFILES - Concrete Synthesis Parameters
// ============================================================================

const MOOD_PROFILES = {
    darkwave: {
        oscillator: 'sawtooth',
        detune: 5,
        filter: { type: 'lowpass', freq: 800, Q: 5 },
        distortion: { amount: 0.7, wet: 0.6 },
        reverb: { decay: 3.0, wet: 0.6 },
        bpm: 90,
        description: 'Heavy sawtooth, dark distortion, reverb-heavy'
    },
    outrun: {
        oscillator: 'square',
        detune: 2,
        filter: { type: 'highpass', freq: 400, Q: 2 },
        distortion: { amount: 0.3, wet: 0.3 },
        reverb: { decay: 1.0, wet: 0.2 },
        bpm: 140,
        description: 'Fast, driving, high energy, aggressive'
    },
    lofi: {
        oscillator: 'triangle',
        detune: 1,
        filter: { type: 'lowpass', freq: 2000, Q: 3 },
        distortion: { amount: 0.1, wet: 0.1 },
        reverb: { decay: 2.0, wet: 0.4 },
        bpm: 85,
        description: 'Warm, nostalgic, bitcrushed, relaxed'
    },
    synthpop: {
        oscillator: 'square',
        detune: 3,
        filter: { type: 'lowpass', freq: 2000, Q: 5 },
        distortion: { amount: 0.2, wet: 0.2 },
        reverb: { decay: 2.5, wet: 0.3 },
        bpm: 120,
        description: 'Bright, danceable, polished, energetic'
    }
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

let audioContext = null;
let audioBuffer = null;
let selectedMood = 'darkwave';
let isPlaying = false;
let generatedTracks = null;
let toneInstruments = {};

// Analysis results
let analysisResults = {
    bpm: 120,
    key: 'C',
    energy: 0.5,
    harmonics: [],
    transients: [],
    pitchTrack: []
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
    uploadArea: document.getElementById('uploadArea'),
    audioFile: document.getElementById('audioFile'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    fileDuration: document.getElementById('fileDuration'),
    waveformCanvas: document.getElementById('waveformCanvas'),
    spectrumCanvas: document.getElementById('spectrumCanvas'),
    midiCanvas: document.getElementById('midiCanvas'),
    estimatedBPM: document.getElementById('estimatedBPM'),
    detectedKey: document.getElementById('detectedKey'),
    energyLevel: document.getElementById('energyLevel'),
    harmonicContent: document.getElementById('harmonicContent'),
    moodBtns: document.querySelectorAll('.mood-btn'),
    playBtn: document.getElementById('playBtn'),
    stopBtn: document.getElementById('stopBtn'),
    generateBtn: document.getElementById('generateBtn'),
    leadMute: document.getElementById('leadMute'),
    bassMute: document.getElementById('bassMute'),
    padMute: document.getElementById('padMute'),
    arpMute: document.getElementById('arpMute'),
    bpmInput: document.getElementById('bpmInput'),
    exportMidiBtn: document.getElementById('exportMidiBtn'),
    exportWavBtn: document.getElementById('exportWavBtn'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    statusMessages: document.getElementById('statusMessages')
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function logStatus(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    p.className = `status-${type}`;
    elements.statusMessages.appendChild(p);
    elements.statusMessages.scrollTop = elements.statusMessages.scrollHeight;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function hzToNote(frequency) {
    // Convert frequency to MIDI note number
    const noteNum = 12 * (Math.log2(frequency / 440)) + 69;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const note = noteNames[Math.round(noteNum) % 12];
    const octave = Math.floor(Math.round(noteNum) / 12) - 1;
    return `${note}${octave}`;
}

function noteToHz(note, octave) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteIndex = noteNames.indexOf(note);
    const midiNum = (octave + 1) * 12 + noteIndex;
    return 440 * Math.pow(2, (midiNum - 69) / 12);
}

function getScaleNotes(key, scaleType = 'major') {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const scales = {
        major: [0, 2, 4, 5, 7, 9, 11],
        minor: [0, 2, 3, 5, 7, 8, 10],
        harmonicMinor: [0, 2, 3, 5, 7, 8, 11]
    };
    const rootIndex = noteNames.indexOf(key.replace(/[0-9]/g, ''));
    const octave = parseInt(key.replace(/[^0-9]/g, '')) || 4;
    const intervals = scales[scaleType] || scales.major;
    return intervals.map(interval => {
        const noteIndex = (rootIndex + interval) % 12;
        return `${noteNames[noteIndex]}${octave}`;
    });
}

// ============================================================================
// WAVEFORM ANALYSIS - Two-Stage Pipeline
// ============================================================================

async function analyzeWaveform(buffer) {
    logStatus('Starting waveform analysis...', 'info');

    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Stage 1: FFT-based spectral analysis
    logStatus('Stage 1: FFT spectral analysis...', 'info');
    const spectralData = await performFFT(channelData, sampleRate);

    // Stage 2: Transient detection (onset detection)
    logStatus('Stage 2: Transient detection...', 'info');
    const transients = detectTransients(channelData, sampleRate);

    // Extract features
    const pitchTrack = extractPitchTrack(spectralData, sampleRate);
    const bpm = estimateBPM(transients, sampleRate);
    const key = detectKey(spectralData, pitchTrack);
    const energy = calculateEnergy(channelData);

    analysisResults = {
        bpm: bpm,
        key: key,
        energy: energy,
        harmonics: spectralData.harmonics,
        transients: transients,
        pitchTrack: pitchTrack,
        spectralPeaks: spectralData.peaks
    };

    // Update UI
    elements.estimatedBPM.textContent = `${Math.round(bpm)} BPM`;
    elements.detectedKey.textContent = key;
    elements.energyLevel.textContent = `${(energy * 100).toFixed(1)}%`;
    elements.harmonicContent.textContent = `${spectralData.harmonics.length} harmonics`;

    logStatus(`Analysis complete: ${Math.round(bpm)} BPM, key: ${key}`, 'success');
    return analysisResults;
}

async function performFFT(data, sampleRate) {
    const fftSize = 2048;
    const sampleStep = Math.floor(data.length / 1000); // Analyze 1000 windows
    const harmonics = [];
    const peaks = [];

    for (let i = 0; i < data.length; i += sampleStep) {
        const chunk = data.slice(i, i + fftSize);
        if (chunk.length < fftSize) break;

        // Simple FFT implementation
        const spectrum = computeSpectrum(chunk);

        // Find dominant frequencies (peaks)
        const localPeaks = findPeaks(spectrum, sampleRate, fftSize);
        peaks.push({ time: i / sampleRate, frequencies: localPeaks });

        // Extract harmonic series
        if (localPeaks.length > 0) {
            const fundamental = localPeaks[0];
            harmonics.push(fundamental);
        }
    }

    return { harmonics, peaks };
}

function computeSpectrum(data) {
    // Simple magnitude spectrum
    const N = data.length;
    const spectrum = new Float32Array(N / 2);

    for (let k = 0; k < N / 2; k++) {
        let real = 0;
        let imag = 0;
        for (let n = 0; n < N; n++) {
            const angle = (2 * Math.PI * k * n) / N;
            real += data[n] * Math.cos(angle);
            imag -= data[n] * Math.sin(angle);
        }
        spectrum[k] = Math.sqrt(real * real + imag * imag);
    }

    return spectrum;
}

function findPeaks(spectrum, sampleRate, fftSize) {
    const peaks = [];
    const threshold = 0.3; // Threshold for peak detection

    for (let i = 1; i < spectrum.length - 1; i++) {
        if (spectrum[i] > spectrum[i - 1] &&
            spectrum[i] > spectrum[i + 1] &&
            spectrum[i] > threshold) {
            const frequency = (i * sampleRate) / fftSize;
            peaks.push(frequency);
        }
    }

    return peaks.sort((a, b) => b - a).slice(0, 5); // Top 5 peaks
}

function detectTransients(data, sampleRate) {
    const transients = [];
    const windowSize = 1024;
    const hopSize = 512;
    let previousEnergy = 0;
    const threshold = 0.4; // Energy threshold for onset detection

    for (let i = 0; i < data.length - windowSize; i += hopSize) {
        const window = data.slice(i, i + windowSize);
        const energy = window.reduce((sum, sample) => sum + sample * sample, 0) / windowSize;

        // Detect sudden energy increase
        if (energy > previousEnergy * (1 + threshold) && energy > 0.001) {
            transients.push({
                time: i / sampleRate,
                energy: energy
            });
        }

        previousEnergy = energy;
    }

    return transients;
}

function extractPitchTrack(spectralData, sampleRate) {
    // Extract pitch from dominant frequency in each frame
    return spectralData.peaks.map(frame => {
        if (frame.frequencies.length > 0) {
            return {
                time: frame.time,
                frequency: frame.frequencies[0],
                note: hzToNote(frame.frequencies[0])
            };
        }
        return null;
    }).filter(p => p !== null);
}

function estimateBPM(transients, sampleRate) {
    if (transients.length < 4) return MOOD_PROFILES[selectedMood].bpm;

    // Calculate inter-onset intervals
    const intervals = [];
    for (let i = 1; i < transients.length; i++) {
        intervals.push(transients[i].time - transients[i - 1].time);
    }

    // Find most common interval
    const histogram = {};
    intervals.forEach(interval => {
        const rounded = Math.round(interval * 100) / 100;
        histogram[rounded] = (histogram[rounded] || 0) + 1;
    });

    let mostCommonInterval = Object.entries(histogram).sort((a, b) => b[1] - a[1])[0];
    if (!mostCommonInterval) return MOOD_PROFILES[selectedMood].bpm;

    const intervalSeconds = parseFloat(mostCommonInterval[0]);
    let bpm = 60 / intervalSeconds;

    // Round to nearest reasonable BPM
    bpm = Math.round(bpm / 5) * 5;
    bpm = Math.max(60, Math.min(180, bpm));

    return bpm;
}

function detectKey(spectralData, pitchTrack) {
    if (pitchTrack.length === 0) return 'C4';

    // Simple key detection based on most common notes
    const noteCounts = {};
    pitchTrack.forEach(p => {
        const noteWithoutOctave = p.note.replace(/[0-9]/g, '');
        noteCounts[noteWithoutOctave] = (noteCounts[noteWithoutOctave] || 0) + 1;
    });

    const sortedNotes = Object.entries(noteCounts).sort((a, b) => b[1] - a[1]);
    const rootNote = sortedNotes[0] ? sortedNotes[0][0] : 'C';

    // Determine major or minor based on third
    const thirdInMajor = ['E', 'G', 'B', 'D', 'F#', 'A#', 'C#'];
    const scaleType = thirdInMajor.includes(rootNote) ? 'major' : 'minor';

    return `${rootNote}4`;
}

function calculateEnergy(data) {
    const rms = Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
    return Math.min(rms * 5, 1); // Normalize to 0-1
}

// ============================================================================
// WAVEFORM VISUALIZATION
// ============================================================================

function drawWaveform(buffer) {
    const canvas = elements.waveformCanvas;
    const ctx = canvas.getContext('2d');

    // Set canvas size
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    // Clear canvas
    ctx.fillStyle = '#0d0221';
    ctx.fillRect(0, 0, width, height);

    // Get channel data
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;

    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;

        for (let j = 0; j < step; j++) {
            const datum = data[i * step + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }

        const y = (1 + min) * amp;
        const y2 = (1 + max) * amp;

        if (i === 0) {
            ctx.moveTo(i, y);
        } else {
            ctx.lineTo(i, y);
        }
    }

    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = '#3d1a5c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
}

function drawSpectrum(spectralData) {
    const canvas = elements.spectrumCanvas;
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    ctx.fillStyle = '#0d0221';
    ctx.fillRect(0, 0, width, height);

    if (!spectralData || spectralData.harmonics.length === 0) {
        ctx.fillStyle = '#b0b0b0';
        ctx.font = '14px Arial';
        ctx.fillText('No spectrum data available', 20, height / 2);
        return;
    }

    // Draw frequency bins
    const barWidth = width / 50;
    const frequencies = spectralData.harmonics.slice(0, 50);

    frequencies.forEach((freq, i) => {
        const barHeight = Math.min((freq / 2000) * height * 0.8, height * 0.8);
        const x = i * barWidth;
        const y = height - barHeight;

        // Gradient color based on frequency
        const hue = 180 + (freq / 2000) * 60; // Cyan to blue
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.fillRect(x, y, barWidth - 1, barHeight);
    });
}

// ============================================================================
// TRACK GENERATION
// ============================================================================

function generateTracks() {
    logStatus('Generating tracks based on analysis...', 'info');

    const mood = MOOD_PROFILES[selectedMood];
    const key = analysisResults.key;
    const bpm = analysisResults.bpm;
    const scaleNotes = getScaleNotes(key, 'major');
    const duration = 16; // 16 bars

    generatedTracks = {
        lead: generateLeadTrack(scaleNotes, mood, bpm, duration),
        bass: generateBassTrack(scaleNotes, mood, bpm, duration),
        pad: generatePadTrack(scaleNotes, mood, bpm, duration),
        arp: generateArpTrack(scaleNotes, analysisResults.transients, mood, bpm, duration)
    };

    logStatus('Track generation complete!', 'success');
    drawMidiVisualization(generatedTracks);

    // Enable export buttons
    elements.exportMidiBtn.disabled = false;
    elements.exportWavBtn.disabled = false;
    elements.exportJsonBtn.disabled = false;

    return generatedTracks;
}

function generateLeadTrack(scaleNotes, mood, bpm, bars) {
    const notes = [];
    const beatDuration = 60 / bpm;
    const eighthNote = beatDuration / 2;

    for (let bar = 0; bar < bars; bar++) {
        const rootNote = scaleNotes[bar % scaleNotes.length];
        const rootOctave = parseInt(rootNote.replace(/[^0-9]/g, ''));
        const rootName = rootNote.replace(/[0-9]/g, '');

        // Generate melody based on analysis
        for (let beat = 0; beat < 4; beat++) {
            const time = (bar * 4 + beat) * beatDuration;

            // Use pitch track if available
            if (analysisResults.pitchTrack.length > 0) {
                const pitchIndex = Math.floor((bar * 4 + beat) % analysisResults.pitchTrack.length);
                const pitch = analysisResults.pitchTrack[pitchIndex];
                if (pitch && scaleNotes.some(n => n.includes(pitch.note.replace(/[0-9]/g, '')))) {
                    notes.push({
                        note: pitch.note,
                        time: time,
                        duration: eighthNote,
                        velocity: 80 + Math.floor(analysisResults.energy * 20)
                    });
                    continue;
                }
            }

            // Fallback: use scale notes
            const scaleIndex = Math.floor(Math.random() * scaleNotes.length);
            const noteName = scaleNotes[scaleIndex].replace(/[0-9]/g, '');
            const octave = rootOctave + (scaleIndex > 4 ? 1 : 0);
            notes.push({
                note: `${noteName}${octave}`,
                time: time,
                duration: eighthNote,
                velocity: 70 + Math.floor(Math.random() * 30)
            });
        }
    }

    return notes;
}

function generateBassTrack(scaleNotes, mood, bpm, bars) {
    const notes = [];
    const beatDuration = 60 / bpm;

    for (let bar = 0; bar < bars; bar++) {
        const rootIndex = bar % scaleNotes.length;
        const rootNote = scaleNotes[rootIndex].replace(/[0-9]/g, '');
        const rootOctave = parseInt(scaleNotes[rootIndex].replace(/[^0-9]/g, '')) - 1;

        // Bass follows root notes, octave down
        const time = bar * 4 * beatDuration;
        notes.push({
            note: `${rootNote}${rootOctave}`,
            time: time,
            duration: beatDuration * 2,
            velocity: 100
        });

        // Add occasional variation
        if (bar % 4 === 2) {
            notes.push({
                note: `${rootNote}${rootOctave + 1}`,
                time: time + beatDuration * 2,
                duration: beatDuration,
                velocity: 80
            });
        }
    }

    return notes;
}

function generatePadTrack(scaleNotes, mood, bpm, bars) {
    const notes = [];
    const beatDuration = 60 / bpm;
    const attack = 0.5;
    const release = 1.5;

    for (let bar = 0; bar < bars; bar++) {
        const rootIndex = bar % scaleNotes.length;
        const rootOctave = parseInt(scaleNotes[rootIndex].replace(/[^0-9]/g, ''));

        // Generate triads (root, third, fifth)
        const thirdIndex = (rootIndex + 2) % scaleNotes.length;
        const fifthIndex = (rootIndex + 4) % scaleNotes.length;

        const time = bar * 4 * beatDuration;
        const duration = beatDuration * 4;

        // Add chord notes
        notes.push({
            note: scaleNotes[rootIndex],
            time: time,
            duration: duration,
            velocity: 60
        });
        notes.push({
            note: scaleNotes[thirdIndex].replace(/[0-9]/g, '') + rootOctave,
            time: time,
            duration: duration,
            velocity: 60
        });
        notes.push({
            note: scaleNotes[fifthIndex].replace(/[0-9]/g, '') + rootOctave,
            time: time,
            duration: duration,
            velocity: 60
        });
    }

    return notes;
}

function generateArpTrack(scaleNotes, transients, mood, bpm, bars) {
    const notes = [];
    const beatDuration = 60 / bpm;
    const sixteenthNote = beatDuration / 4;

    for (let bar = 0; bar < bars; bar++) {
        const rootOctave = parseInt(scaleNotes[bar % scaleNotes.length].replace(/[^0-9]/g, ''));

        // Arpeggio pattern based on transients
        const pattern = [0, 2, 4, 2, 0, 3, 4, 2]; // 1/16 note pattern

        pattern.forEach((scaleOffset, i) => {
            const time = (bar * 4 + (i / 8)) * beatDuration;
            const noteIndex = (bar + scaleOffset) % scaleNotes.length;
            const noteName = scaleNotes[noteIndex].replace(/[0-9]/g, '');

            notes.push({
                note: `${noteName}${rootOctave + 1}`,
                time: time,
                duration: sixteenthNote,
                velocity: 70
            });
        });
    }

    return notes;
}

// ============================================================================
// MIDI VISUALIZATION
// ============================================================================

function drawMidiVisualization(tracks) {
    const canvas = elements.midiCanvas;
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    ctx.fillStyle = '#0d0221';
    ctx.fillRect(0, 0, width, height);

    if (!tracks) return;

    const trackColors = {
        lead: '#ff00ff',
        bass: '#00ffff',
        pad: '#ffff00',
        arp: '#ff6600'
    };

    const trackHeight = height / 4;

    Object.entries(tracks).forEach(([trackName, notes], trackIndex) => {
        const y = trackIndex * trackHeight;

        // Draw track label
        ctx.fillStyle = trackColors[trackName];
        ctx.font = 'bold 12px Arial';
        ctx.fillText(trackName.toUpperCase(), 10, y + 20);

        // Draw notes
        notes.forEach(note => {
            const noteNum = noteToMidi(note.note);
            const normalizedNote = (noteNum - 60) / 24; // Normalize around C4
            const x = (note.time / (16 * (60 / analysisResults.bpm))) * width;
            const noteHeight = 8;

            ctx.fillStyle = trackColors[trackName];
            ctx.fillRect(x, y + 25 + normalizedNote * trackHeight * 0.5,
                        width / 64, noteHeight);
        });
    });

    // Draw grid lines
    ctx.strokeStyle = '#3d1a5c';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 16; i++) {
        const x = (i / 16) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
}

function noteToMidi(note) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteName = note.replace(/[0-9]/g, '');
    const octave = parseInt(note.replace(/[^0-9]/g, ''));
    return (octave + 1) * 12 + noteNames.indexOf(noteName);
}

// ============================================================================
// TONE.JS AUDIO ENGINE
// ============================================================================

async function initializeTone() {
    await Tone.start();
    logStatus('Tone.js audio engine initialized', 'success');

    // Set BPM
    Tone.Transport.bpm.value = analysisResults.bpm;
    elements.bpmInput.value = analysisResults.bpm;

    // Create instruments based on mood profile
    createInstruments();
}

function createInstruments() {
    const mood = MOOD_PROFILES[selectedMood];

    // Clean up existing instruments
    Object.values(toneInstruments).forEach(inst => inst.dispose());
    toneInstruments = {};

    // Lead synth
    toneInstruments.lead = new Tone.Synth({
        oscillator: { type: mood.oscillator },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 }
    }).chain(
        new Tone.Filter(mood.filter),
        new Tone.Distortion(mood.distortion.amount),
        new Tone.Reverb({ decay: mood.reverb.decay, wet: mood.reverb.wet }),
        Tone.Destination
    );

    // Bass synth with sidechain
    toneInstruments.bass = new Tone.Synth({
        oscillator: { type: mood.oscillator },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.3 }
    }).chain(
        new Tone.Filter({ type: 'lowpass', frequency: 400 }),
        new Tone.Reverb({ decay: 1.5, wet: 0.3 }),
        Tone.Destination
    );

    // Pad synth with slow attack/release
    toneInstruments.pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 2.0 }
    }).chain(
        new Tone.Filter({ type: 'lowpass', frequency: 2000 }),
        new Tone.Reverb({ decay: 4.0, wet: 0.5 }),
        Tone.Destination
    );

    // Arpeggiator synth
    toneInstruments.arp = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.2 }
    }).chain(
        new Tone.Filter({ type: 'highpass', frequency: 600 }),
        Tone.Destination
    );

    logStatus('Tone.js instruments created', 'success');
}

function scheduleTracks() {
    if (!generatedTracks) return;

    // Clear existing events
    Tone.Transport.cancel();

    // Schedule lead
    if (elements.leadMute.checked) {
        generatedTracks.lead.forEach(note => {
            Tone.Transport.schedule(time => {
                toneInstruments.lead.triggerAttackRelease(note.note, note.duration, time, note.velocity / 127);
            }, note.time);
        });
    }

    // Schedule bass
    if (elements.bassMute.checked) {
        generatedTracks.bass.forEach(note => {
            Tone.Transport.schedule(time => {
                toneInstruments.bass.triggerAttackRelease(note.note, note.duration, time, note.velocity / 127);
            }, note.time);
        });
    }

    // Schedule pad
    if (elements.padMute.checked) {
        generatedTracks.pad.forEach(note => {
            Tone.Transport.schedule(time => {
                toneInstruments.pad.triggerAttackRelease(note.note, note.duration, time, note.velocity / 127);
            }, note.time);
        });
    }

    // Schedule arp
    if (elements.arpMute.checked) {
        generatedTracks.arp.forEach(note => {
            Tone.Transport.schedule(time => {
                toneInstruments.arp.triggerAttackRelease(note.note, note.duration, time, note.velocity / 127);
            }, note.time);
        });
    }

    logStatus('Tracks scheduled for playback', 'success');
}

// ============================================================================
// MIDI EXPORT
// ============================================================================

function exportMidi() {
    if (!generatedTracks) {
        logStatus('No tracks to export', 'error');
        return;
    }

    logStatus('Generating MIDI file...', 'info');

    const midiData = createMidiFile(generatedTracks);
    downloadMidi(midiData, 'synthwave_layers.mid');

    logStatus('MIDI file exported successfully', 'success');
}

function createMidiFile(tracks) {
    // Simple MIDI file creation (Type 1, multi-track)
    const header = [
        0x4D, 0x54, 0x68, 0x64, // MThd
        0x00, 0x00, 0x00, 0x06, // Header length
        0x00, 0x01, // Type 1 (multi-track)
        0x00, 0x04, // 4 tracks
        (analysisResults.bpm & 0xFF00) >> 8, analysisResults.bpm & 0xFF // Tempo
    ];

    const trackNames = ['Lead', 'Bass', 'Pad', 'Arp'];
    const trackKeys = ['lead', 'bass', 'pad', 'arp'];

    let allTracks = [header];

    trackKeys.forEach((key, trackIndex) => {
        const trackNotes = tracks[key];
        const trackData = createMidiTrack(trackNotes, trackIndex, trackNames[trackIndex]);
        allTracks = allTracks.concat(trackData);
    });

    return new Uint8Array(allTracks);
}

function createMidiTrack(notes, trackIndex, trackName) {
    const trackEvents = [];

    // Track name meta event
    trackEvents.push(0x00, 0xFF, 0x03);
    trackEvents.push(trackName.length);
    for (let i = 0; i < trackName.length; i++) {
        trackEvents.push(trackName.charCodeAt(i));
    }

    // Program change (set instrument)
    trackEvents.push(0x00, 0xC0 + trackIndex, trackIndex);

    // Sort notes by time
    const sortedNotes = [...notes].sort((a, b) => a.time - b.time);
    let lastTime = 0;

    sortedNotes.forEach(note => {
        const deltaTime = Math.round(note.time * 480) - lastTime; // 480 ticks per quarter note
        lastTime += deltaTime;

        // Note on
        trackEvents.push(...encodeVariableLength(deltaTime));
        trackEvents.push(0x90 + trackIndex);
        trackEvents.push(noteToMidi(note.note));
        trackEvents.push(note.velocity);

        // Note off
        const noteOffTime = Math.round((note.time + note.duration) * 480) - lastTime;
        lastTime += noteOffTime;
        trackEvents.push(...encodeVariableLength(noteOffTime));
        trackEvents.push(0x80 + trackIndex);
        trackEvents.push(noteToMidi(note.note));
        trackEvents.push(0x00);
    });

    // End of track
    trackEvents.push(0x00, 0xFF, 0x2F, 0x00);

    // MTrk header
    const trackHeader = [
        0x4D, 0x54, 0x72, 0x6B, // MTrk
        (trackEvents.length & 0xFF000000) >> 24,
        (trackEvents.length & 0x00FF0000) >> 16,
        (trackEvents.length & 0x0000FF00) >> 8,
        trackEvents.length & 0x000000FF
    ];

    return trackHeader.concat(trackEvents);
}

function encodeVariableLength(value) {
    const bytes = [];
    bytes.push(value & 0x7F);

    while ((value >>= 7) > 0) {
        bytes.unshift((value & 0x7F) | 0x80);
    }

    return bytes;
}

function downloadMidi(data, filename) {
    const blob = new Blob([data], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================================================
// WAV EXPORT (Placeholder)
// ============================================================================

function exportWav() {
    logStatus('WAV export requires recording playback...', 'warning');
    logStatus('Please use MIDI export for now', 'info');
}

// ============================================================================
// JSON EXPORT
// ============================================================================

function exportJson() {
    if (!generatedTracks) {
        logStatus('No tracks to export', 'error');
        return;
    }

    const exportData = {
        version: '1.0.0',
        mood: selectedMood,
        moodProfile: MOOD_PROFILES[selectedMood],
        analysis: analysisResults,
        tracks: generatedTracks,
        exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'synthwave_layers_config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logStatus('JSON config exported successfully', 'success');
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// File upload
elements.audioFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    logStatus(`Loading file: ${file.name}`, 'info');

    try {
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);

        elements.fileInfo.classList.remove('hidden');
        elements.fileName.textContent = file.name;
        elements.fileDuration.textContent = `${Math.round(audioBuffer.duration)}s`;

        drawWaveform(audioBuffer);

        await analyzeWaveform(audioBuffer);
        drawSpectrum(analysisResults);

        elements.playBtn.disabled = false;
        elements.generateBtn.disabled = false;

        logStatus('Audio loaded and analyzed successfully', 'success');
    } catch (error) {
        logStatus(`Error loading audio: ${error.message}`, 'error');
    }
});

// Drag and drop
elements.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.add('dragover');
});

elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.classList.remove('dragover');
});

elements.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'audio/wav' || file.type === 'audio/mpeg' || file.type === 'audio/ogg')) {
        elements.audioFile.files = e.dataTransfer.files;
        elements.audioFile.dispatchEvent(new Event('change'));
    }
});

// Mood selection
elements.moodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        elements.moodBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedMood = btn.dataset.mood;

        if (toneInstruments.lead) {
            createInstruments();
        }

        logStatus(`Mood profile changed to: ${selectedMood}`, 'info');
    });
});

// Playback controls
elements.playBtn.addEventListener('click', async () => {
    if (isPlaying) {
        Tone.Transport.stop();
        isPlaying = false;
        elements.playBtn.textContent = '▶ Play';
        return;
    }

    if (!audioContext) {
        await initializeTone();
    }

    if (generatedTracks) {
        scheduleTracks();
    }

    Tone.Transport.start();
    isPlaying = true;
    elements.playBtn.textContent = '⏸ Pause';
    logStatus('Playback started', 'success');
});

elements.stopBtn.addEventListener('click', () => {
    Tone.Transport.stop();
    isPlaying = false;
    elements.playBtn.textContent = '▶ Play';
    logStatus('Playback stopped', 'info');
});

// Generate tracks
elements.generateBtn.addEventListener('click', async () => {
    if (!audioContext) {
        await initializeTone();
    }

    generateTracks();
});

// Track mute toggles
[elements.leadMute, elements.bassMute, elements.padMute, elements.arpMute].forEach(toggle => {
    toggle.addEventListener('change', () => {
        if (isPlaying && generatedTracks) {
            scheduleTracks();
        }
    });
});

// BPM input
elements.bpmInput.addEventListener('change', () => {
    const newBpm = parseInt(elements.bpmInput.value);
    if (newBpm >= 60 && newBpm <= 180) {
        Tone.Transport.bpm.value = newBpm;
        analysisResults.bpm = newBpm;
        logStatus(`BPM changed to ${newBpm}`, 'info');
    }
});

// Export buttons
elements.exportMidiBtn.addEventListener('click', exportMidi);
elements.exportWavBtn.addEventListener('click', exportWav);
elements.exportJsonBtn.addEventListener('click', exportJson);

// ============================================================================
// INITIALIZATION
// ============================================================================

logStatus('Synthwave Layers v1.0.0 initialized', 'success');
logStatus('Ready to upload audio file', 'info');
