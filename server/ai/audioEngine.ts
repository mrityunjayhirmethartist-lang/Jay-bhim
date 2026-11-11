import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

export interface BinaryStatus {
  installed: boolean;
  path: string;
  version?: string;
  error?: string;
}

export interface AudioTechnicalReport {
  valid: boolean;
  format: string;
  codec: string;
  durationSec: number;
  sampleRateHz: number;
  channels: number;
  bitrateKbps: number;
  bitDepth?: number;
  maxVolumeDb?: number;
  meanVolumeDb?: number;
  hasClipping: boolean;
  hasExcessiveSilence: boolean;
  silenceDurationSec: number;
  corruptAudio: boolean;
  warnings: string[];
  errors: string[];
}

export interface ChromaprintResult {
  success: boolean;
  durationSec: number;
  fingerprint: string;
  fingerprintHash: string;
  error?: string;
}

export interface AcoustIdMatchItem {
  acoustidId: string;
  score: number;
  title?: string;
  artist?: string;
  musicbrainzId?: string;
  releaseGroupTitle?: string;
}

export interface AcoustIdLookupResult {
  status: 'MATCH_FOUND' | 'NO_MATCH_FOUND' | 'NOT_CONFIGURED' | 'ERROR' | 'DISABLED';
  matches: AcoustIdMatchItem[];
  rawResponse?: any;
  error?: string;
}

export function getFfmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

export function getFfprobePath(): string {
  const ffmpeg = getFfmpegPath();
  if (ffmpeg.endsWith('ffmpeg')) {
    return ffmpeg.slice(0, -6) + 'ffprobe';
  }
  return 'ffprobe';
}

export function getFpcalcPath(): string {
  return process.env.CHROMAPRINT_PATH?.trim() || 'fpcalc';
}

export async function checkFfmpegBinary(): Promise<BinaryStatus> {
  const bin = getFfmpegPath();
  try {
    const { stdout } = await execFileAsync(bin, ['-version'], { timeout: 5000 });
    const firstLine = stdout.split('\n')[0]?.trim() || 'installed';
    return { installed: true, path: bin, version: firstLine };
  } catch (err: any) {
    return { installed: false, path: bin, error: err.message || 'FFmpeg not found' };
  }
}

export async function checkChromaprintBinary(): Promise<BinaryStatus> {
  const bin = getFpcalcPath();
  try {
    const { stdout } = await execFileAsync(bin, ['-v'], { timeout: 5000 });
    return { installed: true, path: bin, version: stdout.trim() || 'installed' };
  } catch (err: any) {
    return { installed: false, path: bin, error: err.message || 'Chromaprint (fpcalc) not found' };
  }
}

/**
 * Writes buffer to an isolated temp file for FFmpeg / fpcalc inspection, then cleans up.
 */
export async function withTempAudioFile<T>(
  buffer: Buffer,
  extHint: string,
  fn: (tempFilePath: string) => Promise<T>
): Promise<T> {
  const safeExt = extHint.startsWith('.') ? extHint : `.${extHint || 'wav'}`;
  const tempPath = path.join(os.tmpdir(), `rudraatma-ai-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`);
  fs.writeFileSync(tempPath, buffer);
  try {
    return await fn(tempPath);
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * MODULE C: Technical Audio Quality & Integrity Inspection via ffprobe + ffmpeg
 */
export async function analyzeAudioTechnical(filePath: string): Promise<AudioTechnicalReport> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const ffprobe = getFfprobePath();
  const ffmpeg = getFfmpegPath();

  try {
    const { stdout: probeOut } = await execFileAsync(
      ffprobe,
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 25000 }
    );
    const probe = JSON.parse(probeOut || '{}');
    const audioStream = (probe.streams || []).find((s: any) => s.codec_type === 'audio');
    const fmt = probe.format || {};

    if (!audioStream) {
      return {
        valid: false,
        format: fmt.format_name || 'unknown',
        codec: 'none',
        durationSec: 0,
        sampleRateHz: 0,
        channels: 0,
        bitrateKbps: 0,
        hasClipping: false,
        hasExcessiveSilence: false,
        silenceDurationSec: 0,
        corruptAudio: true,
        warnings,
        errors: ['No valid audio stream found in uploaded file.']
      };
    }

    const durationSec = Number(fmt.duration || audioStream.duration || 0);
    const sampleRateHz = Number(audioStream.sample_rate || 0);
    const channels = Number(audioStream.channels || 0);
    const bitrateKbps = Math.round(Number(fmt.bit_rate || audioStream.bit_rate || 0) / 1000);
    const bitDepth = audioStream.bits_per_raw_sample
      ? Number(audioStream.bits_per_raw_sample)
      : audioStream.bits_per_sample
        ? Number(audioStream.bits_per_sample)
        : undefined;

    if (durationSec < 15) {
      warnings.push(`Track duration (${durationSec.toFixed(1)}s) is very short for commercial DSP distribution.`);
    }
    if (sampleRateHz < 44100) {
      warnings.push(`Sample rate (${sampleRateHz} Hz) is below standard 44,100 Hz.`);
    }
    if (channels < 2) {
      warnings.push(`Audio has ${channels} channel(s); stereo (2 channels) is recommended.`);
    }
    if (bitrateKbps > 0 && bitrateKbps < 192 && audioStream.codec_name === 'mp3') {
      warnings.push(`MP3 bitrate (${bitrateKbps} kbps) is below recommended 320 kbps.`);
    }

    // Run volumedetect & silencedetect in a single ffmpeg pass (capped at 120s for fast scan)
    let maxVolumeDb: number | undefined;
    let meanVolumeDb: number | undefined;
    let silenceDurationSec = 0;
    let corruptAudio = false;

    try {
      const { stderr } = await execFileAsync(
        ffmpeg,
        [
          '-v',
          'info',
          '-t',
          '180',
          '-i',
          filePath,
          '-af',
          'volumedetect,silencedetect=noise=-50dB:d=2.5',
          '-f',
          'null',
          '-'
        ],
        { timeout: 35000, maxBuffer: 4 * 1024 * 1024 }
      );

      const maxMatch = stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/);
      const meanMatch = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
      if (maxMatch) maxVolumeDb = Number(maxMatch[1]);
      if (meanMatch) meanVolumeDb = Number(meanMatch[1]);

      const silenceMatches = [...stderr.matchAll(/silence_duration:\s*([\d.]+)/g)];
      silenceDurationSec = silenceMatches.reduce((sum, m) => sum + Number(m[1] || 0), 0);
    } catch (ffErr: any) {
      corruptAudio = true;
      errors.push(`Audio decode check failed: ${ffErr.message || 'corrupt stream'}`);
    }

    const hasClipping = typeof maxVolumeDb === 'number' && maxVolumeDb >= -0.05;
    if (hasClipping) {
      warnings.push(`Peak level (${maxVolumeDb} dB) indicates potential digital clipping/distortion.`);
    }

    const hasExcessiveSilence = durationSec > 0 && silenceDurationSec / durationSec > 0.35;
    if (hasExcessiveSilence) {
      warnings.push(`Detected ${silenceDurationSec.toFixed(1)}s of silence (>35% of scanned duration).`);
    }

    return {
      valid: !corruptAudio && durationSec > 0,
      format: fmt.format_name || 'unknown',
      codec: audioStream.codec_name || 'unknown',
      durationSec,
      sampleRateHz,
      channels,
      bitrateKbps,
      bitDepth,
      maxVolumeDb,
      meanVolumeDb,
      hasClipping,
      hasExcessiveSilence,
      silenceDurationSec,
      corruptAudio,
      warnings,
      errors
    };
  } catch (err: any) {
    return {
      valid: false,
      format: 'unknown',
      codec: 'unknown',
      durationSec: 0,
      sampleRateHz: 0,
      channels: 0,
      bitrateKbps: 0,
      hasClipping: false,
      hasExcessiveSilence: false,
      silenceDurationSec: 0,
      corruptAudio: true,
      warnings,
      errors: [err.message || 'Failed to inspect audio file with ffprobe.']
    };
  }
}

/**
 * MODULE A1: Generate Chromaprint Audio Fingerprint using fpcalc
 */
export async function generateChromaprint(filePath: string): Promise<ChromaprintResult> {
  const fpcalc = getFpcalcPath();
  try {
    const { stdout } = await execFileAsync(fpcalc, ['-json', filePath], {
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024
    });
    const parsed = JSON.parse(stdout || '{}');
    if (!parsed.fingerprint) {
      return {
        success: false,
        durationSec: Number(parsed.duration || 0),
        fingerprint: '',
        fingerprintHash: '',
        error: 'fpcalc returned an empty fingerprint.'
      };
    }
    const fingerprint = String(parsed.fingerprint);
    const fingerprintHash = crypto.createHash('sha256').update(fingerprint).digest('hex');
    return {
      success: true,
      durationSec: Number(parsed.duration || 0),
      fingerprint,
      fingerprintHash
    };
  } catch (err: any) {
    // fpcalc can exit with code 3 on trailing EOF frame warnings while still emitting valid JSON to stdout
    const fallbackStdout = typeof err?.stdout === 'string' ? err.stdout.trim() : '';
    if (fallbackStdout) {
      try {
        const parsed = JSON.parse(fallbackStdout);
        if (parsed?.fingerprint) {
          const fingerprint = String(parsed.fingerprint);
          const fingerprintHash = crypto.createHash('sha256').update(fingerprint).digest('hex');
          return {
            success: true,
            durationSec: Number(parsed.duration || 0),
            fingerprint,
            fingerprintHash
          };
        }
      } catch {
        // Ignore JSON parse fallback error and return failure below
      }
    }
    return {
      success: false,
      durationSec: 0,
      fingerprint: '',
      fingerprintHash: '',
      error: err.message || 'Chromaprint fpcalc execution failed.'
    };
  }
}

// Simple rate limiter for AcoustID (max ~3 requests/sec per AcoustID guidelines)
let lastAcoustIdRequestAt = 0;

/**
 * MODULE A2: Query official AcoustID Web Service (https://api.acoustid.org/v2/lookup)
 */
export async function queryAcoustId(fingerprint: string, durationSec: number): Promise<AcoustIdLookupResult> {
  const clientKey = process.env.ACOUSTID_CLIENT_KEY?.trim();
  if (!clientKey) {
    return {
      status: 'NOT_CONFIGURED',
      matches: [],
      error: 'ACOUSTID_CLIENT_KEY is not configured on the backend.'
    };
  }

  if (!fingerprint || durationSec <= 0) {
    return {
      status: 'ERROR',
      matches: [],
      error: 'Valid Chromaprint fingerprint and duration are required for AcoustID lookup.'
    };
  }

  // Respect AcoustID rate limit (~350ms spacing)
  const now = Date.now();
  const waitMs = Math.max(0, 360 - (now - lastAcoustIdRequestAt));
  if (waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  lastAcoustIdRequestAt = Date.now();

  try {
    const body = new URLSearchParams({
      client: clientKey,
      meta: 'recordings+releasegroups+compress',
      duration: String(Math.round(durationSec)),
      fingerprint
    });

    const res = await fetch('https://api.acoustid.org/v2/lookup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RudraatmaMusicDistribution/1.0'
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15000)
    });

    const data = await res.json();
    if (!res.ok || data.status !== 'ok') {
      return {
        status: 'ERROR',
        matches: [],
        rawResponse: data,
        error: data?.error?.message || `AcoustID API returned HTTP ${res.status}`
      };
    }

    const matches: AcoustIdMatchItem[] = [];
    for (const r of data.results || []) {
      const score = Number(r.score || 0);
      if (Array.isArray(r.recordings) && r.recordings.length > 0) {
        for (const rec of r.recordings) {
          const artistNames = Array.isArray(rec.artists)
            ? rec.artists.map((a: any) => a.name).filter(Boolean).join(', ')
            : undefined;
          const rgTitle = Array.isArray(rec.releasegroups) && rec.releasegroups[0]?.title
            ? rec.releasegroups[0].title
            : undefined;
          matches.push({
            acoustidId: r.id,
            score,
            title: rec.title,
            artist: artistNames,
            musicbrainzId: rec.id,
            releaseGroupTitle: rgTitle
          });
        }
      } else {
        matches.push({
          acoustidId: r.id,
          score
        });
      }
    }

    if (matches.length === 0) {
      return {
        status: 'NO_MATCH_FOUND',
        matches: [],
        rawResponse: data
      };
    }

    return {
      status: 'MATCH_FOUND',
      matches,
      rawResponse: data
    };
  } catch (err: any) {
    return {
      status: 'ERROR',
      matches: [],
      error: err.message || 'AcoustID lookup network error.'
    };
  }
}
