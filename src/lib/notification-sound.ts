"use client";

const SOUND_PREF_KEY = "nook_admin_sound_enabled";
const AUDIO_FILE_PATH = "/sounds/order-notification.wav";

// In-memory set of order IDs that have already played sound during this session
const playedSoundOrderIds = new Set<string>();

// Track pending sound if autoplay was blocked before first user interaction
let pendingSoundOrderId: string | null = null;
let autoplayUnlocked = false;
let userInteractionListenerRegistered = false;

/**
 * Check whether sound notifications are enabled. Defaults to true.
 */
export function isNotificationSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const val = localStorage.getItem(SOUND_PREF_KEY);
    return val === null ? true : val === "true";
  } catch {
    return true;
  }
}

/**
 * Set sound notification preference and persist to localStorage.
 */
export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SOUND_PREF_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage errors in incognito/restricted mode
  }
}

/**
 * Pure Web Audio API chime synthesizer.
 * Plays a pleasant, two-tone chime (D5 -> A5) with warm exponential decay.
 * Guaranteed 0-dependency, works without any external audio files.
 */
export function playWebAudioChime(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5) - bright chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.25, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Tone 2: 880.00 Hz (A5) - bell ring
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.0, now + 0.1);

    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(0.3, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.55);

    // Auto close context after chime finishes to release hardware
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1000);
  } catch (err) {
    console.warn("[Admin Notification Sound] Web Audio chime could not play:", err);
  }
}

/**
 * Register global interaction listeners to unlock audio playback if autoplay was restricted.
 */
function ensureUserInteractionUnlock(): void {
  if (typeof window === "undefined" || userInteractionListenerRegistered || autoplayUnlocked) return;
  userInteractionListenerRegistered = true;

  const unlock = () => {
    autoplayUnlocked = true;
    userInteractionListenerRegistered = false;

    // Remove listeners
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("touchstart", unlock, true);

    // If there is a pending order sound queued before the user clicked, play it now
    if (pendingSoundOrderId && isNotificationSoundEnabled()) {
      const orderIdToPlay = pendingSoundOrderId;
      pendingSoundOrderId = null;
      triggerSoundPlayback(orderIdToPlay);
    }
  };

  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
  window.addEventListener("touchstart", unlock, { once: true, capture: true });
}

/**
 * Internal sound playback trigger with audio file + Web Audio fallback.
 */
function triggerSoundPlayback(orderId?: string): void {
  if (orderId) {
    playedSoundOrderIds.add(orderId);
  }

  try {
    const audio = new Audio(AUDIO_FILE_PATH);
    audio.volume = 0.75;
    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise.catch((err: unknown) => {
        // If autoplay policy blocked the audio element
        if (err instanceof Error && err.name === "NotAllowedError") {
          if (orderId) {
            pendingSoundOrderId = orderId;
          }
          ensureUserInteractionUnlock();
        } else {
          // If audio file decoding failed or file missing, fallback to Web Audio API
          playWebAudioChime();
        }
      });
    }
  } catch {
    playWebAudioChime();
  }
}

/**
 * Play order notification sound for a new incoming order.
 * - Respects soundEnabled preference
 * - Never repeatedly plays for the same order ID
 * - Handles browser autoplay restrictions gracefully
 */
export function playOrderNotificationSound(orderId: string): void {
  if (typeof window === "undefined") return;
  if (!isNotificationSoundEnabled()) return;
  if (!orderId) return;

  // Never repeatedly play sound for the same order
  if (playedSoundOrderIds.has(orderId)) {
    return;
  }

  // Ensure interaction unlock listener is mounted
  ensureUserInteractionUnlock();

  triggerSoundPlayback(orderId);
}

/**
 * Play a short sample chime for user previewing or testing sound settings.
 */
export function playSampleNotificationSound(): void {
  if (typeof window === "undefined") return;
  triggerSoundPlayback();
}
