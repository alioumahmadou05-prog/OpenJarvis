import { useEffect, useState } from 'react';
import { DEFAULT_VOICE, VoiceEngine, type VoiceSettings, type VoiceState } from './voice';

/** One voice engine for the whole app, so only one conversation listens and speaks at a time. */
let engine: VoiceEngine | null = null;
const listeners = new Set<() => void>();
let lastError = '';

export function loadVoiceSettings(): VoiceSettings {
  try { return { ...DEFAULT_VOICE, ...JSON.parse(localStorage.getItem('nx.voice') || '{}') }; } catch { return DEFAULT_VOICE; }
}
export function saveVoiceSettings(s: VoiceSettings) {
  localStorage.setItem('nx.voice', JSON.stringify(s));
  if (engine) engine.settings = s;
}
export function getEngine(): VoiceEngine {
  if (!engine) {
    engine = new VoiceEngine(loadVoiceSettings());
    engine.onState = () => listeners.forEach(l => l());
    engine.onError = msg => { lastError = msg; listeners.forEach(l => l()); };
  }
  return engine;
}

export function useVoice(): { engine: VoiceEngine; state: VoiceState; active: boolean; error: string } {
  const e = getEngine();
  const [, force] = useState(0);
  useEffect(() => { const l = () => force(n => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return { engine: e, state: e.state, active: e.isActive, error: lastError };
}
