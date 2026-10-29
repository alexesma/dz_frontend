import React, { useEffect, useRef } from 'react';
import { Modal, message } from 'antd';

// Сканирование камерой телефона или ТСД. zxing грузим лениво — он тяжёлый.
const CameraScanModal = ({ open, onClose, onScan }) => {
    const videoRef = useRef(null);
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;

    useEffect(() => {
        if (!open) return undefined;
        let controls = null;
        let cancelled = false;
        let lastCode = '';
        let lastAt = 0;
        (async () => {
            try {
                const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
                    await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
                const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [
                    BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
                    BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE,
                ]]]);
                const reader = new BrowserMultiFormatReader(hints);
                const started = await reader.decodeFromConstraints(
                    { video: { facingMode: 'environment' } }, videoRef.current,
                    (result) => {
                        if (!result) return;
                        const code = result.getText();
                        const now = Date.now();
                        // камера видит один код много кадров подряд
                        if (code === lastCode && now - lastAt < 2000) { lastAt = now; return; }
                        lastCode = code;
                        lastAt = now;
                        onScanRef.current?.(code);
                    },
                );
                if (cancelled) started.stop(); else controls = started;
            } catch {
                message.error('Не удалось открыть камеру. Разрешите доступ к камере в браузере.');
                onClose?.();
            }
        })();
        return () => { cancelled = true; controls?.stop(); };
    }, [open, onClose]);

    return <Modal open={open} title="Сканирование камерой" footer={null} onCancel={onClose} destroyOnClose>
        <video ref={videoRef} style={{ width: '100%', borderRadius: 8, background: '#000' }} muted playsInline />
    </Modal>;
};

export default CameraScanModal;
