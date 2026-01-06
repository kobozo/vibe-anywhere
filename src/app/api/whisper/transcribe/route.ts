/**
 * Whisper Transcription API
 * POST endpoint for transcribing audio using OpenAI Whisper
 */

import { NextRequest } from 'next/server';
import { getSettingsService } from '@/lib/services/settings-service';
import { requireAuth, successResponse, errorResponse, withErrorHandling } from '@/lib/api-utils';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB (OpenAI limit)
const ALLOWED_FORMATS = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/ogg'];

/**
 * POST /api/whisper/transcribe
 * Transcribe audio file using OpenAI Whisper
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  await requireAuth(request);

  // Get the OpenAI API key
  const settingsService = getSettingsService();
  const apiKey = await settingsService.getOpenAIApiKey();

  if (!apiKey) {
    return errorResponse('WHISPER_NOT_CONFIGURED', 'OpenAI API key is not configured. Please set it in Settings.', 400);
  }

  // Parse the multipart form data
  const formData = await request.formData();
  const audioFile = formData.get('audio') as File | null;

  if (!audioFile) {
    return errorResponse('NO_AUDIO_FILE', 'No audio file provided', 400);
  }

  // Validate file size
  if (audioFile.size > MAX_FILE_SIZE) {
    return errorResponse('FILE_TOO_LARGE', `Audio file must be less than 25MB (got ${Math.round(audioFile.size / 1024 / 1024)}MB)`, 400);
  }

  // Validate file type (be lenient - browser might set different MIME types)
  const mimeType = audioFile.type.toLowerCase();
  if (!ALLOWED_FORMATS.some(format => mimeType.includes(format.split('/')[1]))) {
    // Allow if the type contains common audio indicators
    if (!mimeType.includes('audio') && !mimeType.includes('webm') && !mimeType.includes('wav') && !mimeType.includes('mp')) {
      return errorResponse('INVALID_FORMAT', `Unsupported audio format: ${audioFile.type}. Supported: webm, wav, mp3, mp4, m4a, ogg`, 400);
    }
  }

  // Prepare the request to OpenAI Whisper API
  const whisperFormData = new FormData();
  whisperFormData.append('file', audioFile, audioFile.name || 'audio.webm');
  whisperFormData.append('model', 'whisper-1');

  // Optional: Get language from form data
  const language = formData.get('language') as string | null;
  if (language) {
    whisperFormData.append('language', language);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: whisperFormData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = 'Whisper API error';

      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        // Use raw error text if not JSON
        errorMessage = errorBody || errorMessage;
      }

      // Handle specific error cases
      if (response.status === 401) {
        return errorResponse('INVALID_API_KEY', 'Invalid OpenAI API key. Please check your settings.', 401);
      }
      if (response.status === 429) {
        return errorResponse('RATE_LIMITED', 'OpenAI rate limit exceeded. Please try again later.', 429);
      }
      if (response.status === 400) {
        return errorResponse('WHISPER_ERROR', `Whisper error: ${errorMessage}`, 400);
      }

      return errorResponse('WHISPER_ERROR', `Whisper API error: ${errorMessage}`, response.status);
    }

    const result = await response.json();

    return successResponse({
      transcription: result.text || '',
    });
  } catch (error) {
    console.error('Whisper transcription error:', error);

    if (error instanceof TypeError && error.message.includes('fetch')) {
      return errorResponse('NETWORK_ERROR', 'Network error connecting to OpenAI. Please check your internet connection.', 500);
    }

    return errorResponse('TRANSCRIPTION_FAILED', 'Failed to transcribe audio. Please try again.', 500);
  }
});
