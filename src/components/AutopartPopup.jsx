/**
 * AutopartPopup — карточка товара во всплывающем окне поверх текущей страницы.
 *
 * Открывает ту же полную карточку номенклатуры (редактирование, кроссы, фото),
 * но в окне: после «Сохранить» или «Отмена» окно закрывается, и пользователь
 * остаётся на своём документе. Внутри — iframe на страницу номенклатуры в
 * режиме embedded, которая сообщает родителю о закрытии через postMessage.
 */
import React, { useEffect, useState } from 'react';
import { Button, Modal, Spin, Tooltip } from 'antd';
import { EditOutlined } from '@ant-design/icons';

export const AUTOPART_POPUP_MESSAGE = 'dz-autopart-popup';

export const AutopartPopup = ({ autopartId, open, onClose, onSaved }) => {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!open) return undefined;
        setLoaded(false);
        const handler = (event) => {
            if (event.origin !== window.location.origin) return;
            const data = event.data || {};
            if (data.type !== AUTOPART_POPUP_MESSAGE) return;
            if (data.saved) onSaved?.();
            onClose?.();
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [open, onClose, onSaved]);

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            closable={false}
            width="min(1240px, 98vw)"
            centered
            destroyOnClose
            styles={{
                body: { padding: 0, height: '90vh', position: 'relative' },
                content: { padding: 0, background: 'transparent', boxShadow: 'none' },
            }}
        >
            {open && (
                <>
                    {!loaded && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Spin size="large" />
                        </div>
                    )}
                    <iframe
                        title="Карточка товара"
                        src={`/autoparts/nomenclature?autopart_id=${autopartId}&edit=1&embedded=1`}
                        onLoad={() => setLoaded(true)}
                        style={{ border: 0, width: '100%', height: '100%', background: 'transparent' }}
                    />
                </>
            )}
        </Modal>
    );
};

/** Кнопка «Открыть товар» напротив строки документа. */
export const OpenProductButton = ({ autopartId, onSaved, size = 'small' }) => {
    const [open, setOpen] = useState(false);
    if (!autopartId) return null;
    return (
        <>
            <Tooltip title="Открыть товар (редактирование)">
                <Button
                    size={size}
                    type="text"
                    icon={<EditOutlined />}
                    onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                    aria-label="Открыть товар"
                />
            </Tooltip>
            <AutopartPopup
                autopartId={autopartId}
                open={open}
                onClose={() => setOpen(false)}
                onSaved={onSaved}
            />
        </>
    );
};

export default OpenProductButton;
