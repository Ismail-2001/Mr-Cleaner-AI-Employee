'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ChatInterface.module.css';
import { Send, X, Bot, Camera, Image as ImageIcon } from 'lucide-react';
import BookingSummary from './BookingSummary';
import ErrorBoundary from './ErrorBoundary';
import { supabase } from '@/lib/supabase';

function formatMessage(text) {
    if (!text || typeof text !== 'string') return text;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        const italicParts = part.split(/(\*[^*]+\*)/g);
        return italicParts.map((subPart, j) => {
            if (subPart.startsWith('*') && subPart.endsWith('*') && !subPart.startsWith('**')) {
                return <em key={`${i}-${j}`}>{subPart.slice(1, -1)}</em>;
            }
            return subPart;
        });
    });
}

function getStoredSessionId() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('maya_session_id');
}

const containerVariants = {
    hidden: { opacity: 0, scale: 0.9, y: 40 },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
    },
    exit: {
        opacity: 0,
        scale: 0.95,
        y: 20,
        transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
    },
};

const messageVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
    },
};

export default function ChatInterface({ onClose, initialMessage }) {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: "Hi! This is Maya with Mr. Cleaner Mobile Detailing. Are you looking to schedule a detail today?" }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [bookingData, setBookingData] = useState(null);
    const [showSummary, setShowSummary] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const [isLoadingSession, setIsLoadingSession] = useState(true);
    const [pendingImages, setPendingImages] = useState([]); // {url, path, uploading}
    const [isUploading, setIsUploading] = useState(false);
    const messagesEndRef = useRef(null);
    const messagesRef = useRef(messages);
    const overlayRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);

    // Focus trap
    useEffect(() => {
        const overlay = overlayRef.current;
        if (!overlay) return;

        const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const firstFocusable = overlay.querySelector(focusableSelector);

        firstFocusable?.focus();

        function handleTab(e) {
            if (e.key !== 'Tab') return;
            const focusables = overlay.querySelectorAll(focusableSelector);
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }

        overlay.addEventListener('keydown', handleTab);
        return () => overlay.removeEventListener('keydown', handleTab);
    }, [isLoadingSession]);

    // Esc to close
    useEffect(() => {
        function handleEsc(e) {
            if (e.key === 'Escape' && !isLoadingSession) {
                onClose?.();
            }
        }
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose, isLoadingSession]);

    useEffect(() => {
        setSessionId(getStoredSessionId());
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        if (!sessionId) {
            setIsLoadingSession(false);
            return;
        }

        const initSession = async () => {
            try {
                if (supabase) {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) {
                        await supabase.auth.signInAnonymously();
                    }
                }
                if (supabase && sessionId) {
                    const { data, error } = await supabase
                        .from('chat_sessions')
                        .select('message_history, customer_data')
                        .eq('session_id', sessionId)
                        .single();
                    if (!error && data) {
                        if (data.message_history && data.message_history.length > 0) {
                            setMessages(data.message_history);
                        }
                        if (data.customer_data && Object.keys(data.customer_data).length > 0) {
                            setBookingData(data.customer_data);
                            if (data.customer_data.vehicle_type && data.customer_data.service) {
                                setShowSummary(true);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("Session restore failed:", e);
            } finally {
                setIsLoadingSession(false);
            }
        };
        initSession();
    }, [sessionId]);

    const hasSentInitialRef = useRef(false);
    useEffect(() => {
        if (initialMessage && !hasSentInitialRef.current && !isLoadingSession) {
            hasSentInitialRef.current = true;
            handleSend(initialMessage);
        }
    }, [initialMessage, isLoadingSession, handleSend]);

    const handleSend = useCallback(async (text, imageUrls = []) => {
        const messageText = text || input;
        if (!messageText.trim() && imageUrls.length === 0) return;

        const newUserMessage = {
            role: 'user',
            content: messageText || (imageUrls.length > 0 ? 'Please analyze my vehicle photo.' : ''),
            ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
        };
        const updatedMessages = [...messagesRef.current, newUserMessage];
        setMessages(updatedMessages);
        messagesRef.current = updatedMessages;
        setInput('');
        setPendingImages([]);
        setIsTyping(true);

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (sessionId) headers['x-session-id'] = sessionId;

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    messages: updatedMessages.map(m => ({
                        role: m.role,
                        content: m.content
                    }))
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to get response");
            }

            const data = await response.json();
            setIsTyping(false);

            if (data.session_id && !sessionId) {
                setSessionId(data.session_id);
                localStorage.setItem('maya_session_id', data.session_id);
            }

            if (data.content) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
            }

            if (data.bookingData) {
                setBookingData(prev => ({ ...prev, ...data.bookingData }));
                if (data.bookingData.vehicle_type && data.bookingData.service) {
                    setShowSummary(true);
                }
            }
        } catch (error) {
            console.error("Chat error:", error);
            setIsTyping(false);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "I'm having a little trouble connecting to my brain right now."
            }]);
        }
    }, [input, sessionId]);

    const handlePhotoSelect = useCallback(async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        // Reset file input so same file can be re-selected
        e.target.value = '';

        const newImages = files.slice(0, 5 - pendingImages.length).map(f => ({
            file: f,
            preview: URL.createObjectURL(f),
            uploading: true,
            url: null,
            path: null,
        }));

        setPendingImages(prev => [...prev, ...newImages]);
        setIsUploading(true);

        // Upload each file
        for (let i = 0; i < newImages.length; i++) {
            const img = newImages[i];
            try {
                const formData = new FormData();
                formData.append('file', img.file);
                formData.append('session_id', sessionId || 'anonymous');

                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error?.message || 'Upload failed');
                }

                const data = await response.json();
                setPendingImages(prev => prev.map((p, idx) =>
                    p.preview === img.preview ? { ...p, uploading: false, url: data.url, path: data.path } : p
                ));
            } catch (err) {
                console.error('Photo upload error:', err);
                setPendingImages(prev => prev.filter(p => p.preview !== img.preview));
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Couldn't upload photo: ${err.message}. Please try a different image.`,
                }]);
            }
        }

        setIsUploading(false);
    }, [pendingImages.length, sessionId]);

    const removePendingImage = useCallback((preview) => {
        setPendingImages(prev => {
            const img = prev.find(p => p.preview === preview);
            if (img) URL.revokeObjectURL(img.preview);
            return prev.filter(p => p.preview !== preview);
        });
    }, []);

    const triggerPhotoUpload = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const canSend = (input.trim() || pendingImages.some(i => i.url)) && !isTyping && !isUploading;

    const handleSendClick = useCallback(() => {
        if (!canSend) return;
        const urls = pendingImages.filter(i => i.url).map(i => i.url);
        handleSend(input, urls);
    }, [canSend, input, pendingImages, handleSend]);

    const confirmBooking = async () => {
        try {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData),
            });
            if (response.ok) {
                setMessages(prev => [...prev, { role: 'assistant', content: "Perfect! You're all set. I've sent a confirmation text to your phone. We'll see you soon!" }]);
                setShowSummary(false);
            } else {
                const err = await response.json();
                const errorMsg = err.error?.message || "Sorry, that time slot is no longer available. Could you pick a different time?";
                setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
                setShowSummary(false);
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (isLoadingSession) {
        return (
            <motion.div
                className={styles.overlay}
                ref={overlayRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <motion.div
                    className={styles.container}
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                >
                    <div className={styles.header}>
                        <div className={styles.botProfile}>
                            <div className={styles.avatar}><Bot size={24} /></div>
                            <div>
                                <h3>Maya</h3>
                                <span>Loading your session...</span>
                            </div>
                        </div>
                        <button className={styles.closeBtn} aria-label="Close chat" onClick={onClose}><X size={24} /></button>
                    </div>
                </motion.div>
            </motion.div>
        );
    }

    return (
        <AnimatePresence>
            <motion.div
                className={styles.overlay}
                ref={overlayRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={(e) => { if (e.target === overlayRef.current) onClose?.(); }}
                role="dialog"
                aria-modal="true"
                aria-label="Chat with Maya"
            >
                <motion.div
                    className={styles.container}
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                >
                    <div className={styles.header}>
                        <div className={styles.botProfile}>
                            <div className={styles.avatar}><Bot size={24} /></div>
                            <div>
                                <h3>Maya</h3>
                                <span>Online &bull; AI Booking Assistant</span>
                            </div>
                        </div>
                        <button className={styles.closeBtn} aria-label="Close chat" onClick={onClose}><X size={24} /></button>
                    </div>

                    <ErrorBoundary>
                        <div className={styles.messageList} aria-live="polite">
                            <AnimatePresence initial={false}>
                                {messages.map((msg, i) => (
                                    <motion.div
                                        key={i}
                                        className={`${styles.messageRow} ${msg.role === 'user' ? styles.userRow : styles.botRow}`}
                                        variants={messageVariants}
                                        initial="hidden"
                                        animate="visible"
                                        layout
                                    >
                                        <div className={styles.messageBubble}>
                                            {formatMessage(msg.content)}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {isTyping && (
                                <motion.div
                                    className={styles.messageRow}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className={`${styles.messageBubble} ${styles.typing}`} aria-label="Maya is typing" role="status">
                                        <span></span><span></span><span></span>
                                    </div>
                                </motion.div>
                            )}
                            {showSummary && (
                                <BookingSummary
                                    data={bookingData}
                                    onConfirm={confirmBooking}
                                    onCancel={() => setShowSummary(false)}
                                />
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className={styles.inputArea}>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                multiple
                                capture="environment"
                                onChange={handlePhotoSelect}
                                style={{ display: 'none' }}
                                aria-label="Upload vehicle photo"
                            />
                            {pendingImages.length > 0 && (
                                <div className={styles.imagePreviewRow}>
                                    {pendingImages.map((img) => (
                                        <div key={img.preview} className={styles.imagePreview}>
                                            {/* next/image cannot optimize blob: object URLs, so a plain img is required here */}
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={img.preview} alt="Vehicle photo" />
                                            {img.uploading && <div className={styles.uploadOverlay}><div className={styles.spinner}></div></div>}
                                            <button
                                                className={styles.removeImageBtn}
                                                onClick={() => removePendingImage(img.preview)}
                                                aria-label="Remove photo"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className={styles.inputRow}>
                                <button
                                    onClick={triggerPhotoUpload}
                                    className={styles.cameraBtn}
                                    disabled={isTyping || isUploading || pendingImages.length >= 5}
                                    aria-label="Upload vehicle photo"
                                    title="Send a vehicle photo"
                                >
                                    <Camera size={20} />
                                </button>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    aria-label="Type your message to Maya"
                                    placeholder={isTyping ? "Maya is thinking..." : pendingImages.length > 0 ? "Add a message (optional)..." : "Type your message..."}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !isTyping && handleSendClick()}
                                    disabled={isTyping}
                                />
                                <button
                                    onClick={handleSendClick}
                                    className={styles.sendBtn}
                                    disabled={!canSend}
                                >
                                    {isTyping ? <div className={styles.spinner}></div> : <Send size={20} />}
                                </button>
                            </div>
                        </div>
                    </ErrorBoundary>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
