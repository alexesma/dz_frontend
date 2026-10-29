import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal, message } from 'antd';

const FORMATS = ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'data_matrix'];
const VIDEO = {
    facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 },
    focusMode: 'continuous',
};

// Сканирование камерой телефона. Где есть встроенный BarcodeDetector (Android/Chrome),
// используем его: он аппаратный и намного быстрее. Иначе — zxing, который грузится лениво.
const CameraScanModal = ({ open, onClose, onScan }) => {
    const videoRef = useRef(null);
    const trackRef = useRef(null);
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;
    const [torch, setTorch] = useState({ available: false, on: false });

    useEffect(() => {
        if (!open) return undefined;
        let stop = () => {};
        let cancelled = false;
        let lastCode = '';
        let lastAt = 0;
        // камера видит один код много кадров подряд — повтор в пределах 2 секунд гасим
        const emit = (code) => {
            const now = Date.now();
            if (code === lastCode && now - lastAt < 2000) { lastAt = now; return; }
            lastCode = code;
            lastAt = now;
            onScanRef.current?.(code);
        };

        const startNative = async () => {
            const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO });
            if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
            const [track] = stream.getVideoTracks();
            trackRef.current = track;
            setTorch({ available: !!track.getCapabilities?.().torch, on: false });
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            const detector = new window.BarcodeDetector({ formats: FORMATS });
            let busy = false;
            const timer = setInterval(async () => {
                if (busy || !videoRef.current) return;
                busy = true;
                try {
                    const found = await detector.detect(videoRef.current);
                    if (found[0]?.rawValue) emit(found[0].rawValue);
                } catch { /* кадр не распознан */ } finally { busy = false; }
            }, 120);
            stop = () => { clearInterval(timer); stream.getTracks().forEach((item) => item.stop()); };
        };

        const startZxing = async () => {
            const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
                await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
            const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [
                BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
                BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE,
                BarcodeFormat.DATA_MATRIX,
            ]]]);
            const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
            const controls = await reader.decodeFromConstraints(
                { video: VIDEO }, videoRef.current,
                (result) => { if (result) emit(result.getText()); },
            );
            if (cancelled) controls.stop(); else stop = () => controls.stop();
        };

        (async () => {
            try {
                if ('BarcodeDetector' in window) await startNative();
                else await startZxing();
            } catch {
                message.error('Не удалось открыть камеру. Разрешите доступ к камере в браузере.');
                onClose?.();
            }
        })();
        return () => { cancelled = true; stop(); trackRef.current = null; };
    }, [open, onClose]);

    const toggleTorch = async () => {
        const next = !torch.on;
        try {
            await trackRef.current?.applyConstraints({ advanced: [{ torch: next }] });
            setTorch((prev) => ({ ...prev, on: next }));
        } catch { message.warning('Фонарик недоступен'); }
    };

    return <Modal open={open} title="Сканирование камерой" onCancel={onClose} destroyOnClose
        footer={torch.available ? [<Button key="torch" onClick={toggleTorch}>
            {torch.on ? 'Выключить фонарик' : 'Фонарик'}</Button>] : null}>
        <video ref={videoRef} style={{ width: '100%', borderRadius: 8, background: '#000' }} muted playsInline />
    </Modal>;
};

export default CameraScanModal;
