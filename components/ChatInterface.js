'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './ChatInterface.module.css';
import { Send, X, Bot } from 'lucide-react';
import BookingSummary from './BookingSummary';
import ErrorBoundary from './ErrorBoundary';
import { supabase } from '@/lib/supabase';

/**
 * BOOKING DATA PERSISTENCE FIX:
 * Previously, bookingData lived only in React state and was lost on page refresh,
 * forcing Maya to restart booking collection from scratch without telling the user
 * why. Now we:
 * 1. Use a stable session ID persisted in localStorage (not random per mount)
 * 2. Load bookingData + message history from Supabase on mount
 * 3. The server-side chat route already saves bookingData to chat_sessions on
 *    every response — we just need to read it back on load
 */
function getSessionId() {
    if (typeof window === 'undefined') return 'sess_' + Math.random().toString(36).substr(2, 9);
    const stored = localStorage.getItem('maya_session_id');
    if (stored) return stored;
    const newId = 'sess_' + window.crypto.randomUUID();
    localStorage.setItem('maya_session_id', newId);
    return newId;
}

export default function ChatInterface({ onClose, initialMessage }) {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: "Hi! This is Maya with Mr. Cleaner Mobile Detailing. Are you looking to schedule a detail today?" }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [bookingData, setBookingData] = useState(null);
    const [showSummary, setShowSummary] = useState(false);
    // SSR HYDRATION FIX: Initialize sessionId as null, then set it in useEffect.
    // This prevents mismatch between server (random ID) and client (localStorage ID).
    const [sessionId, setSessionId] = useState(null);
    const [isLoadingSession, setIsLoadingSession] = useState(true);
    const messagesEndRef = useRef(null);
    const messagesRef = useRef(messages);

    // Set session ID on client side only (avoids SSR hydration mismatch)
    useEffect(() => {
        setSessionId(getSessionId());
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    // Sync messagesRef with messages state so handleSend always reads current messages
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        // Don't initialize session until sessionId is set (client-side only)
        if (!sessionId) return;

        // --- BOOKING DATA PERSISTENCE FIX ---
        // On mount, load the previous session state from Supabase so a page
        // refresh continues the booking exactly where the user left off.
        const initSession = async () => {
            try {
                // Ensure anonymous Supabase auth
                if (supabase) {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) {
                        await supabase.auth.signInAnonymously();
                    }
                }

                // Load persisted session state from Supabase
                if (supabase && sessionId) {
                    const { data, error } = await supabase
                        .from('chat_sessions')
                        .select('message_history, customer_data')
                        .eq('session_id', sessionId)
                        .single();

                    if (!error && data) {
                        // Restore message history if available
                        if (data.message_history && data.message_history.length > 0) {
                            setMessages(data.message_history);
                        }

                        // Restore bookingData if available
                        if (data.customer_data && Object.keys(data.customer_data).length > 0) {
                            setBookingData(data.customer_data);
                            // Show summary if we have enough data for a partial booking
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
                if (initialMessage) {
                    handleSend(initialMessage);
                }
            }
        };
        initSession();
    }, [sessionId]);

    const handleSend = async (text) => {
        const messageText = text || input;
        if (!messageText.trim()) return;

        const newUserMessage = {
            role: 'user',
            content: messageText
        };

        // STALE CLOSURE FIX: Use messagesRef.current instead of messages state.
        // The handleSend function captures `messages` at definition time. If it's
        // called from useEffect (e.g., initialMessage), it reads stale state and
        // loses messages loaded during session restore.
        const updatedMessages = [...messagesRef.current, newUserMessage];
        setMessages(updatedMessages);
        messagesRef.current = updatedMessages;
        setInput('');
        setIsTyping(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-session-id': sessionId
                },
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
    };

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
                // RACE CONDITION FIX: If 409, the slot was taken by another customer
                // between availability check and booking creation. Show a clear message.
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
            <div className={styles.overlay}>
                <div className={`${styles.container} animate-fade-in`}>
                    <div className={styles.header}>
                        <div className={styles.botProfile}>
                            <div className={styles.avatar}><Bot size={24} /></div>
                            <div>
                                <h3>Maya</h3>
                                <span>Loading your session...</span>
                            </div>
                        </div>
                        <button className={styles.closeBtn} onClick={onClose}><X size={24} /></button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.overlay}>
            <div className={`${styles.container} animate-fade-in`}>
                <div className={styles.header}>
                    <div className={styles.botProfile}>
                        <div className={styles.avatar}><Bot size={24} /></div>
                        <div>
                            <h3>Maya</h3>
                            <span>Online • AI Booking Assistant</span>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}><X size={24} /></button>
                </div>

                <ErrorBoundary>
                    <div className={styles.messageList}>
                    {messages.map((msg, i) => (
                        <div key={i} className={`${styles.messageRow} ${msg.role === 'user' ? styles.userRow : styles.botRow}`}>
                            <div className={styles.messageBubble}>
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className={styles.messageRow}>
                            <div className={`${styles.messageBubble} ${styles.typing}`}>
                                <span></span><span></span><span></span>
                            </div>
                        </div>
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
                        type="text"
                        placeholder={isTyping ? "Maya is thinking..." : "Type your message..."}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !isTyping && handleSend()}
                        disabled={isTyping}
                    />
                    <button
                        onClick={() => handleSend()}
                        className={styles.sendBtn}
                        disabled={!input.trim() || isTyping}
                    >
                        {isTyping ? <div className={styles.spinner}></div> : <Send size={20} />}
                    </button>
                </div>
                </ErrorBoundary>
            </div>
        </div>
    );
}
