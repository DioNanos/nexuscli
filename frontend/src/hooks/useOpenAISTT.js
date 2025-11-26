import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook for Speech-to-Text using OpenAI Whisper API
 * Automatically uses current UI language (it, en, es, ja, ru, zh)
 */
export default function useOpenAISTT(options = {}) {
  const { i18n } = useTranslation();
  const { token } = useAuth();
  const { onResult = () => {}, onError = () => {} } = options;

  // Use current UI language (it, en, es, ja, ru, zh)
  const language = i18n.language || 'it';

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Use webm/opus for best Whisper compatibility
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        await transcribe();
      };

      mediaRecorder.start();
      setIsRecording(true);
      console.log('[OpenAI STT] Recording started');

    } catch (error) {
      console.error('[OpenAI STT] Recording error:', error);
      if (error.name === 'NotAllowedError') {
        onError('Microphone access denied. Please allow microphone access.');
      } else {
        onError(error.message || 'Failed to start recording');
      }
    }
  }, [onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      console.log('[OpenAI STT] Recording stopped');
    }
  }, [isRecording]);

  const transcribe = async () => {
    try {
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      console.log('[OpenAI STT] Transcribing audio:', {
        size: audioBlob.size,
        language
      });

      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('language', language);

      const response = await fetch('/api/v1/speech/transcribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Transcription failed');
      }

      const data = await response.json();
      const text = data.text || '';

      console.log('[OpenAI STT] Transcription result:', text.substring(0, 50) + '...');
      setTranscript(text);
      onResult(text);

    } catch (error) {
      console.error('[OpenAI STT] Transcription error:', error);
      onError(error.message);
    }
  };

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  // Check if mediaDevices is available (requires secure context: HTTPS or localhost)
  const isSupported = typeof navigator !== 'undefined' &&
                      navigator.mediaDevices &&
                      typeof navigator.mediaDevices.getUserMedia === 'function';

  return {
    isListening: isRecording,
    isSupported,
    transcript,
    interimTranscript: '', // Whisper doesn't provide interim results
    startListening: startRecording,
    stopListening: stopRecording,
    toggleListening: toggleRecording,
    resetTranscript
  };
}
