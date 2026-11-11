import { GoogleGenAI, Type } from '@google/genai';
import type { AcoustIdLookupResult, AudioTechnicalReport } from './audioEngine';

export interface GeminiReviewReport {
  status: 'COMPLETED' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'DISABLED';
  model: string;
  copyrightRiskExplanation: string;
  metadataAccuracyReport: string;
  missingInformationReport: string;
  artworkComplianceReport: string;
  distributionPolicyReport: string;
  recommendedAction: string;
  riskSignals: string[];
  disclaimer: string;
  error?: string;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

export async function testGeminiConnection(): Promise<{ connected: boolean; model: string; message: string }> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      connected: false,
      model: 'gemini-3.8-flash',
      message: 'GEMINI_API_KEY is not configured.'
    };
  }
  try {
    const resp = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Reply with the single word: OK'
    });
    const text = (resp.text || '').trim();
    return {
      connected: Boolean(text),
      model: 'gemini-3.8-flash',
      message: text ? 'Connected to Gemini API successfully.' : 'Empty response from Gemini API.'
    };
  } catch (err: any) {
    return {
      connected: false,
      model: 'gemini-3.8-flash',
      message: err.message || 'Gemini API connection test failed.'
    };
  }
}

export async function runGeminiComplianceReview(params: {
  release: any;
  lyricsText?: string;
  artworkBuffer?: Buffer;
  artworkMimeType?: string;
  acoustIdResult: AcoustIdLookupResult;
  duplicateMatches: Array<{ releaseId: string; title: string; artist: string; matchType: string }>;
  audioTechnical: AudioTechnicalReport;
  enabled: boolean;
}): Promise<GeminiReviewReport> {
  const disclaimer =
    'This AI-assisted review provides compliance and risk guidance based on submitted metadata and available fingerprint evidence. It is not a legal determination of copyright ownership.';

  if (!params.enabled) {
    return {
      status: 'DISABLED',
      model: 'gemini-3.8-flash',
      copyrightRiskExplanation: 'Gemini AI analysis is disabled in AI Service Settings.',
      metadataAccuracyReport: 'Skipped (Gemini disabled).',
      missingInformationReport: 'Skipped (Gemini disabled).',
      artworkComplianceReport: 'Skipped (Gemini disabled).',
      distributionPolicyReport: 'Skipped (Gemini disabled).',
      recommendedAction: 'ADMIN REVIEW REQUIRED',
      riskSignals: [],
      disclaimer
    };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return {
      status: 'NOT_CONFIGURED',
      model: 'gemini-3.8-flash',
      copyrightRiskExplanation: 'GEMINI_API_KEY is not configured on the backend. Manual review is required.',
      metadataAccuracyReport: 'Pending manual review (Gemini not configured).',
      missingInformationReport: 'Pending manual review.',
      artworkComplianceReport: 'Pending manual review.',
      distributionPolicyReport: 'Pending manual review.',
      recommendedAction: 'ADMIN REVIEW REQUIRED',
      riskSignals: ['GEMINI_NOT_CONFIGURED'],
      disclaimer,
      error: 'GEMINI_API_KEY is missing.'
    };
  }

  const { release, lyricsText, artworkBuffer, artworkMimeType, acoustIdResult, duplicateMatches, audioTechnical } = params;

  const evidenceSummary = {
    acoustIdStatus: acoustIdResult.status,
    acoustIdMatches: acoustIdResult.matches.slice(0, 10),
    internalDuplicateMatches: duplicateMatches,
    audioTechnicalSummary: {
      valid: audioTechnical.valid,
      format: audioTechnical.format,
      durationSec: audioTechnical.durationSec,
      sampleRateHz: audioTechnical.sampleRateHz,
      bitrateKbps: audioTechnical.bitrateKbps,
      warnings: audioTechnical.warnings
    }
  };

  const releasePayload = {
    title: release.title,
    version: release.version,
    artist: release.artist,
    featuredArtists: release.featuredArtists,
    label: release.label,
    type: release.type,
    language: release.language,
    primaryGenre: release.primaryGenre,
    secondaryGenre: release.secondaryGenre,
    releaseDate: release.releaseDate,
    upc: release.upc,
    copyrightOwner: release.copyrightOwner,
    copyrightYear: release.copyrightYear,
    recordingOwner: release.recordingOwner,
    territories: release.territories,
    rightsConfirmed: release.rightsConfirmed,
    rightsDeclarations: release.rightsDeclarations || {},
    tracks: (release.tracks || []).map((t: any) => ({
      trackNumber: t.trackNumber,
      title: t.title,
      isrc: t.isrc,
      primaryArtist: t.primaryArtist,
      featuredArtists: t.featuredArtists,
      composer: t.composer,
      lyricist: t.lyricist,
      producer: t.producer,
      musicDirector: t.musicDirector,
      explicit: t.explicit
    })),
    lyricsExcerpt: (lyricsText || release.lyrics || '').slice(0, 4000)
  };

  const prompt = `You are a Senior Music Distribution Compliance Analyst for Rudraatma Music Distribution.
Analyze the following music release submission, lyrics, rights declarations, artwork (if attached), and ACTUAL audio fingerprint matching evidence.

STRICT RULES:
1. NEVER invent, guess, or fabricate copyright matches or external recordings. ONLY reference matches present in "evidenceSummary".
2. If AcoustID status is "NO_MATCH_FOUND", state clearly that no AcoustID match was found, while noting that absence of a match is NOT legal proof of originality.
3. Do NOT accuse original artists based on common genres, chord progressions, or generic beats.
4. Check metadata accuracy (typos, placeholder names, artist/title stuffing, explicit tag consistency with lyrics, missing composer/lyricist/producer/music director, rights declarations for samples/remixes/covers).
5. Check artwork (if attached) for prohibited/misleading elements (blurry, text clutter, unauthorized logos, explicit imagery without parental advisory, URLs/QR codes).
6. Keep technical audio quality issues separate from copyright ownership issues.

Release Data:
${JSON.stringify(releasePayload, null, 2)}

Actual Technical & Fingerprint Evidence:
${JSON.stringify(evidenceSummary, null, 2)}
`;

  const contents: any[] = [{ text: prompt }];
  if (artworkBuffer && artworkMimeType && artworkMimeType.startsWith('image/')) {
    contents.push({
      inlineData: {
        mimeType: artworkMimeType,
        data: artworkBuffer.toString('base64')
      }
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            copyrightRiskExplanation: { type: Type.STRING },
            metadataAccuracyReport: { type: Type.STRING },
            missingInformationReport: { type: Type.STRING },
            artworkComplianceReport: { type: Type.STRING },
            distributionPolicyReport: { type: Type.STRING },
            recommendedAction: { type: Type.STRING },
            riskSignals: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: [
            'copyrightRiskExplanation',
            'metadataAccuracyReport',
            'missingInformationReport',
            'artworkComplianceReport',
            'distributionPolicyReport',
            'recommendedAction',
            'riskSignals'
          ]
        }
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    return {
      status: 'COMPLETED',
      model: 'gemini-3.8-flash',
      copyrightRiskExplanation: parsed.copyrightRiskExplanation || 'Analysis completed.',
      metadataAccuracyReport: parsed.metadataAccuracyReport || 'No metadata issues detected.',
      missingInformationReport: parsed.missingInformationReport || 'No missing fields detected.',
      artworkComplianceReport: parsed.artworkComplianceReport || 'Artwork reviewed.',
      distributionPolicyReport: parsed.distributionPolicyReport || 'Policy check completed.',
      recommendedAction: parsed.recommendedAction || 'ADMIN REVIEW REQUIRED',
      riskSignals: Array.isArray(parsed.riskSignals) ? parsed.riskSignals : [],
      disclaimer
    };
  } catch (err: any) {
    return {
      status: 'UNAVAILABLE',
      model: 'gemini-3.8-flash',
      copyrightRiskExplanation: `Gemini AI analysis unavailable (${err.message || 'API error'}). Manual review required.`,
      metadataAccuracyReport: 'Unavailable — manual review required.',
      missingInformationReport: 'Unavailable — manual review required.',
      artworkComplianceReport: 'Unavailable — manual review required.',
      distributionPolicyReport: 'Unavailable — manual review required.',
      recommendedAction: 'ADMIN REVIEW REQUIRED',
      riskSignals: ['GEMINI_API_ERROR'],
      disclaimer,
      error: err.message || 'Gemini API request failed.'
    };
  }
}
