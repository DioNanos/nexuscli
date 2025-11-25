import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook for Speech-to-Text using Web Speech API
 * Falls back gracefully if not supported
 */
export default function useSpeechToText(options = {}) {
  const {
    language = 'it-IT',
    continuous = true,
    interimResults = true,
    onResult = () => {},
    onError = () => {},
    autoSendDelay = -1, // -1 = disabled, otherwise seconds
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef(null);
  const autoSendTimerRef = useRef(null);

  // Check browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = language;
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;

      recognition.onstart = () => {
        console.log('[STT] Started listening');
        setIsListening(true);
      };

      recognition.onend = () => {
        console.log('[STT] Stopped listening');
        setIsListening(false);
      };

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        if (interim) {
          setInterimTranscript(interim);
        }

        if (final) {
          setTranscript(prev => prev + (prev ? ' ' : '') + final);
          setInterimTranscript('');
          onResult(final);

          // Auto-send timer
          if (autoSendDelay > 0) {
            if (autoSendTimerRef.current) {
              clearTimeout(autoSendTimerRef.current);
            }
            autoSendTimerRef.current = setTimeout(() => {
              stopListening();
            }, autoSendDelay * 1000);
          }
        }
      };

      recognition.onerror = (event) => {
        console.error('[STT] Error:', event.error);
        setIsListening(false);

        if (event.error === 'not-allowed') {
          onError('Microphone access denied. Please allow microphone access.');
        } else if (event.error === 'no-speech') {
          // Ignore - just no speech detected
        } else {
          onError(`Speech recognition error: ${event.error}`);
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (autoSendTimerRef.current) {
        clearTimeout(autoSendTimerRef.current);
      }
    };
  }, [language, continuous, interimResults, autoSendDelay, onResult, onError]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      onError('Speech recognition not supported in this browser');
      return;
    }

    if (recognitionRef.current && !isListening) {
      setTranscript('');
      setInterimTranscript('');
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('[STT] Start error:', e);
      }
    }
  }, [isSupported, isListening, onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      if (autoSendTimerRef.current) {
        clearTimeout(autoSendTimerRef.current);
      }
    }
  }, [isListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
  };
}
