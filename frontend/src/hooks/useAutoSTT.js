import { useState, useEffect, useMemo } from 'react';
import useSpeechToText from './useSpeechToText';
import useOpenAISTT from './useOpenAISTT';

/**
 * Hook that auto-detects which STT provider to use:
 * - If OpenAI key exists → use Whisper API
 * - Otherwise → fallback to browser Web Speech API
 *
 * IMPORTANT: Both hooks are ALWAYS called (Rules of Hooks),
 * then we choose which result to return.
 */
export default function useAutoSTT(options = {}) {
  const [provider, setProvider] = useState('browser'); // 'browser' | 'openai'
  const [isChecking, setIsChecking] = useState(true);

  // CRITICAL: Call BOTH hooks ALWAYS, BEFORE any conditional return
  const browserSTT = useSpeechToText(options);
  const openaiSTT = useOpenAISTT(options);

  // Auto-detect OpenAI key on mount
  useEffect(() => {
    const checkOpenAIKey = async () => {
      try {
        const response = await fetch('/api/v1/keys/check/openai');
        const data = await response.json();

        if (data.exists) {
          console.log('[AutoSTT] OpenAI key found, using Whisper API');
          setProvider('openai');
        } else {
          console.log('[AutoSTT] No OpenAI key, using browser Web Speech API');
          setProvider('browser');
        }
      } catch (error) {
        console.error('[AutoSTT] Key check failed, defaulting to browser:', error);
        setProvider('browser');
      } finally {
        setIsChecking(false);
      }
    };

    checkOpenAIKey();
  }, []);

  // Select result to return (AFTER calling all hooks)
  const result = useMemo(() => {
    // Loading state
    if (isChecking) {
      return {
        isListening: false,
        isSupported: false,
        transcript: '',
        interimTranscript: '',
        startListening: () => {},
        stopListening: () => {},
        toggleListening: () => {},
        resetTranscript: () => {},
        provider: 'checking'
      };
    }

    // Select provider
    const selected = provider === 'openai' ? openaiSTT : browserSTT;

    return {
      ...selected,
      provider // Expose which provider is active (useful for debug/UI)
    };
  }, [isChecking, provider, browserSTT, openaiSTT]);

  return result;
}
