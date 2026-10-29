// Звук и вибрация при скане: на складе экран не всегда перед глазами.
let audioContext = null;

const beep = (frequency, duration) => {
    try {
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.value = 0.15;
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
    } catch { /* звук необязателен */ }
};

export const scanOk = () => {
    beep(1200, 0.08);
    try { navigator.vibrate?.(30); } catch { /* ignore */ }
};

export const scanFail = () => {
    beep(300, 0.3);
    try { navigator.vibrate?.([80, 60, 80]); } catch { /* ignore */ }
};
