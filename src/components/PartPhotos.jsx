import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CameraOutlined, CloseOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { usePartPhotos } from './usePartPhotos.js';
import './PartPhotos.css';

// ── Окно с фотографиями ─────────────────────────────────────────────────────

// Миниатюры платформы Parts-Soft — 150×150 px; растягивать их на всё окно
// значит делать мыло, поэтому показываем крупнее исходного, но не на весь кадр.
const isLowRes = (url) => String(url || '').includes('/thumbnails/');

const Gallery = ({ photos, title, subtitle, origin, onClose }) => {
    const [index, setIndex] = useState(0);
    const [closing, setClosing] = useState(false);
    const [loaded, setLoaded] = useState({});
    const [dir, setDir] = useState(1);

    const close = useCallback(() => {
        setClosing(true);
        setTimeout(onClose, 260);
    }, [onClose]);

    const go = useCallback(
        (step) => {
            setDir(step);
            setIndex((i) => (i + step + photos.length) % photos.length);
        },
        [photos.length]
    );

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') close();
            if (photos.length > 1 && e.key === 'ArrowLeft') go(-1);
            if (photos.length > 1 && e.key === 'ArrowRight') go(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [close, go, photos.length]);

    const style = origin
        ? { '--ox': `${origin.x}px`, '--oy': `${origin.y}px` }
        : { '--ox': '50vw', '--oy': '50vh' };

    return createPortal(
        <div
            className={`pp-overlay${closing ? ' pp-closing' : ''}`}
            onClick={(e) => {
                e.stopPropagation();
                close();
            }}
            style={style}
        >
            <div
                className="pp-card"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="pp-close" onClick={close} aria-label="Закрыть">
                    <CloseOutlined />
                </button>
                <div className="pp-stage">
                    {photos.length > 1 && (
                        <button type="button" className="pp-nav pp-prev" onClick={() => go(-1)}>
                            <LeftOutlined />
                        </button>
                    )}
                    <div className="pp-frame">
                        {!loaded[index] && <div className="pp-shimmer" />}
                        <img
                            key={index}
                            className={`pp-img ${dir > 0 ? 'pp-from-right' : 'pp-from-left'}${
                                loaded[index] ? ' pp-ready' : ''
                            }${isLowRes(photos[index]) ? ' pp-lowres' : ''}`}
                            src={photos[index]}
                            alt={title}
                            onLoad={() => setLoaded((l) => ({ ...l, [index]: true }))}
                            onError={() => setLoaded((l) => ({ ...l, [index]: true }))}
                        />
                    </div>
                    {photos.length > 1 && (
                        <button type="button" className="pp-nav pp-next" onClick={() => go(1)}>
                            <RightOutlined />
                        </button>
                    )}
                </div>
                <div className="pp-caption">
                    <div className="pp-title">{title}</div>
                    {subtitle && <div className="pp-subtitle">{subtitle}</div>}
                    {photos.length > 1 && (
                        <div className="pp-count">
                            {index + 1} / {photos.length}
                        </div>
                    )}
                </div>
                {photos.length > 1 && (
                    <div className="pp-thumbs">
                        {photos.map((src, i) => (
                            <button
                                type="button"
                                key={src}
                                className={`pp-thumb${i === index ? ' pp-active' : ''}`}
                                style={{ animationDelay: `${180 + i * 55}ms` }}
                                onClick={() => {
                                    setDir(i >= index ? 1 : -1);
                                    setIndex(i);
                                }}
                            >
                                <img src={src} alt="" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

// ── Ярлычок ─────────────────────────────────────────────────────────────────
// Показывается только если у детали есть хотя бы одно фото. Клик не уводит
// со страницы — открывается окно поверх.

export const PartPhotoBadge = ({ brand, oem, name, sitePhotoUrl, style }) => {
    const { photos, name: catalogName } = usePartPhotos(brand, oem, sitePhotoUrl);
    const [open, setOpen] = useState(false);
    const originRef = useRef(null);
    if (!photos.length) return null;
    return (
        <>
            <button
                type="button"
                className="pp-badge"
                style={style}
                title="Фото детали"
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    originRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                    setOpen(true);
                }}
            >
                <CameraOutlined />
                {photos.length > 1 && <span className="pp-badge-n">{photos.length}</span>}
            </button>
            {open && (
                <Gallery
                    photos={photos}
                    title={name || catalogName || oem}
                    subtitle={[brand, oem].filter(Boolean).join(' · ')}
                    origin={originRef.current}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
};

export default PartPhotoBadge;
