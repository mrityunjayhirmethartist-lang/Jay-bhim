import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getStoredMedia } from '../storage';
import {
  analyzeAudioTechnical,
  generateChromaprint,
  queryAcoustId,
  withTempAudioFile,
  AudioTechnicalReport,
  AcoustIdLookupResult
} from './audioEngine';
import { runGeminiComplianceReview, GeminiReviewReport } from './geminiReview';
import {
  dbSaveAiJob,
  dbSaveAiResult,
  dbSaveAudioFingerprint,
  dbSaveAcoustIdMatch,
  dbSaveComplianceReport,
  dbSaveReviewHistory,
  dbSaveAiAuditLog
} from '../db';

export type AiStage =
  | 'Release Submitted'
  | 'Audio Processing'
  | 'Fingerprint Generation'
  | 'Music Database Matching'
  | 'AI Metadata Review'
  | 'Audio Quality Review'
  | 'Copyright Risk Assessment'
  | 'Admin Review'
  | 'Approved'
  | 'Rejected';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type AiDecision = 'AUTO APPROVED' | 'ADMIN REVIEW REQUIRED' | 'REJECTED';

export interface AiServiceSettings {
  aiReviewEnabled: boolean;
  geminiAnalysisEnabled: boolean;
  audioFingerprintingEnabled: boolean;
  acoustIdMatchingEnabled: boolean;
  duplicateDetectionEnabled: boolean;
  artworkReviewEnabled: boolean;
  metadataReviewEnabled: boolean;
  autoApprovalEnabled: boolean;
  autoRejectionEnabled: boolean;
  confidenceThreshold: number;
  maxAudioFileSizeMB: number;
  jobConcurrency: number;
}

export const DEFAULT_AI_SETTINGS: AiServiceSettings = {
  aiReviewEnabled: process.env.AI_REVIEW_ENABLED !== 'false',
  geminiAnalysisEnabled: true,
  audioFingerprintingEnabled: true,
  acoustIdMatchingEnabled: true,
  duplicateDetectionEnabled: true,
  artworkReviewEnabled: true,
  metadataReviewEnabled: true,
  autoApprovalEnabled: process.env.AI_AUTO_APPROVAL_ENABLED === 'true',
  autoRejectionEnabled: process.env.AI_AUTO_REJECTION_ENABLED === 'true',
  confidenceThreshold: Number(process.env.AI_REVIEW_CONFIDENCE_THRESHOLD || 95),
  maxAudioFileSizeMB: 150,
  jobConcurrency: 2
};

export interface AiReviewJob {
  id: string;
  userId: string;
  releaseId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  stage: AiStage;
  progress: number;
  attempts: number;
  maxAttempts: number;
  errorDetails?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AiReviewResult {
  id: string;
  jobId: string;
  releaseId: string;
  userId: string;
  riskLevel: RiskLevel;
  recommendedDecision: AiDecision;
  finalDecision: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CORRECTIONS_REQUESTED' | 'DOCS_REQUESTED';
  reviewerId?: string;
  confidenceScore: number;
  durationSec: number;
  fingerprintStatus: 'GENERATED' | 'FAILED' | 'DISABLED' | 'NO_AUDIO';
  fingerprintHash?: string;
  acoustIdStatus: 'MATCH_FOUND' | 'NO_MATCH_FOUND' | 'NOT_CONFIGURED' | 'ERROR' | 'DISABLED';
  acoustIdMatches: any[];
  geminiReport: GeminiReviewReport;
  audioQuality: AudioTechnicalReport;
  duplicateCheck: {
    hasDuplicates: boolean;
    matches: Array<{ releaseId: string; title: string; artist: string; matchType: string }>;
  };
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiQueueContext {
  aiSettings: AiServiceSettings;
  aiJobs: Map<string, AiReviewJob>;
  aiResults: Map<string, AiReviewResult>;
  audioFingerprints: Array<{
    id: string;
    releaseId: string;
    userId: string;
    trackIndex: number;
    durationSec: number;
    fingerprint: string;
    fingerprintHash: string;
    fileId?: string;
    createdAt: string;
  }>;
  complianceReports: Map<string, any>;
  reviewHistory: Array<any>;
  aiAuditLogs: Array<any>;
  releaseAppeals: Array<any>;
  userDashboards: Map<string, any>;
  users: Map<string, any>;
  audioUploadDir: string;
  artworkUploadDir: string;
  dbSaveDashboard: (userId: string, data: any) => Promise<void>;
}

const pendingQueue: string[] = [];
let activeWorkers = 0;

function extractFileIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const mediaMatch = url.match(/\/api\/media\/([^/?#]+)/);
  if (mediaMatch) return mediaMatch[1];
  return null;
}

async function loadMediaBuffer(
  fileUrl: string | undefined,
  localDir: string
): Promise<{ buffer: Buffer; ext: string; mimeType: string } | null> {
  if (!fileUrl) return null;
  const fileId = extractFileIdFromUrl(fileUrl);
  if (fileId) {
    const stored = await getStoredMedia(fileId);
    if (stored) {
      const ext = path.extname(stored.originalName) || '.wav';
      return { buffer: stored.buffer, ext, mimeType: stored.mimeType };
    }
  }
  // Local dev disk fallback (/uploads/audio/...)
  const fileName = path.basename(fileUrl.split('?')[0]);
  const fullPath = path.join(localDir, fileName);
  if (fs.existsSync(fullPath)) {
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fileName).toLowerCase() || '.wav';
    const mimeType =
      ext === '.mp3'
        ? 'audio/mpeg'
        : ext === '.wav'
          ? 'audio/wav'
          : ext === '.png'
            ? 'image/png'
            : 'image/jpeg';
    return { buffer, ext, mimeType };
  }
  return null;
}

export async function appendReviewHistory(
  ctx: AiQueueContext,
  params: {
    releaseId: string;
    actorEmail: string;
    actorRole: string;
    action: string;
    previousStatus?: string;
    newStatus?: string;
    notes?: string;
  }
) {
  const entry = {
    id: 'rhist_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    ...params,
    createdAt: new Date().toISOString()
  };
  ctx.reviewHistory.push(entry);
  await dbSaveReviewHistory(entry);
}

export async function appendAiAudit(
  ctx: AiQueueContext,
  actorEmail: string,
  actorRole: string,
  action: string,
  releaseId: string | undefined,
  details: string
) {
  const entry = {
    id: 'aiaud_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    actorEmail,
    actorRole,
    action,
    releaseId: releaseId || null,
    details,
    createdAt: new Date().toISOString()
  };
  ctx.aiAuditLogs.push(entry);
  await dbSaveAiAuditLog(entry);
}

export function findReleaseOwner(ctx: AiQueueContext, releaseId: string): { release: any; userId: string; dash: any } | null {
  for (const [userId, dash] of ctx.userDashboards.entries()) {
    const release = (dash.releases || []).find((r: any) => r.id === releaseId);
    if (release) return { release, userId, dash };
  }
  return null;
}

export function enqueueAiReviewJob(ctx: AiQueueContext, userId: string, releaseId: string): AiReviewJob {
  // Duplicate job prevention: return existing queued/processing job for same release
  for (const job of ctx.aiJobs.values()) {
    if (job.releaseId === releaseId && (job.status === 'queued' || job.status === 'processing')) {
      return job;
    }
  }

  const job: AiReviewJob = {
    id: 'aijob_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    userId,
    releaseId,
    status: 'queued',
    stage: 'Release Submitted',
    progress: 10,
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString()
  };

  ctx.aiJobs.set(job.id, job);
  void dbSaveAiJob(job);

  if (!pendingQueue.includes(job.id)) {
    pendingQueue.push(job.id);
  }
  void drainQueue(ctx);
  return job;
}

async function drainQueue(ctx: AiQueueContext) {
  const maxConcurrency = Math.max(1, Math.min(5, ctx.aiSettings.jobConcurrency || 2));
  while (activeWorkers < maxConcurrency && pendingQueue.length > 0) {
    const jobId = pendingQueue.shift();
    if (!jobId) break;
    const job = ctx.aiJobs.get(jobId);
    if (!job || job.status === 'cancelled') continue;

    activeWorkers++;
    runJobWithRetry(ctx, job)
      .catch(err => {
        console.error(`[Rudraatma AI] Worker error for job ${job.id}:`, err);
      })
      .finally(() => {
        activeWorkers--;
        void drainQueue(ctx);
      });
  }
}

async function updateJobStage(job: AiReviewJob, stage: AiStage, progress: number) {
  job.stage = stage;
  job.progress = progress;
  await dbSaveAiJob(job);
}

async function runJobWithRetry(ctx: AiQueueContext, job: AiReviewJob) {
  job.status = 'processing';
  job.startedAt = new Date().toISOString();
  await dbSaveAiJob(job);

  while (job.attempts < job.maxAttempts) {
    if ((job.status as string) === 'cancelled') return;
    job.attempts++;
    try {
      await executeAiReviewPipeline(ctx, job);
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      await dbSaveAiJob(job);
      return;
    } catch (err: any) {
      job.errorDetails = err?.message || 'AI review pipeline error';
      await dbSaveAiJob(job);
      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
        job.completedAt = new Date().toISOString();
        await dbSaveAiJob(job);
        await appendReviewHistory(ctx, {
          releaseId: job.releaseId,
          actorEmail: 'system@rudraatmamusic.com',
          actorRole: 'AI_ENGINE',
          action: 'AI_SCAN_FAILED',
          notes: `Job failed after ${job.attempts} attempt(s): ${job.errorDetails}. Remaining pending for manual review.`
        });
        return;
      }
      // Brief backoff before retry
      await new Promise(r => setTimeout(r, 1500 * job.attempts));
    }
  }
}

async function executeAiReviewPipeline(ctx: AiQueueContext, job: AiReviewJob) {
  const found = findReleaseOwner(ctx, job.releaseId);
  if (!found) {
    throw new Error(`Release ${job.releaseId} not found.`);
  }
  const { release, userId, dash } = found;
  const reviewId = 'airev_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');

  // Stage 2: Audio Processing
  await updateJobStage(job, 'Audio Processing', 20);
  const primaryTrack = release.tracks?.[0];
  const primaryAudioUrl = primaryTrack?.audioFileUrl || release.audioUrl;
  const audioMedia = await loadMediaBuffer(primaryAudioUrl, ctx.audioUploadDir);

  let audioQuality: AudioTechnicalReport = {
    valid: false,
    format: 'none',
    codec: 'none',
    durationSec: 0,
    sampleRateHz: 0,
    channels: 0,
    bitrateKbps: 0,
    hasClipping: false,
    hasExcessiveSilence: false,
    silenceDurationSec: 0,
    corruptAudio: false,
    warnings: ['No audio file attached to primary track.'],
    errors: []
  };

  let fingerprintStatus: AiReviewResult['fingerprintStatus'] = audioMedia ? 'DISABLED' : 'NO_AUDIO';
  let fingerprint = '';
  let fingerprintHash = '';
  let fpDurationSec = 0;

  let acoustIdResult: AcoustIdLookupResult = {
    status: ctx.aiSettings.acoustIdMatchingEnabled ? 'NO_MATCH_FOUND' : 'DISABLED',
    matches: []
  };

  if (audioMedia) {
    const mediaResult = await withTempAudioFile(audioMedia.buffer, audioMedia.ext, async tempPath => {
      const aq = await analyzeAudioTechnical(tempPath);
      await updateJobStage(job, 'Fingerprint Generation', 35);
      let fpStatus: AiReviewResult['fingerprintStatus'] = 'DISABLED';
      let fpStr = '';
      let fpHash = '';
      let fpDur = aq.durationSec;

      if (ctx.aiSettings.audioFingerprintingEnabled) {
        const fp = await generateChromaprint(tempPath);
        if (fp.success) {
          fpStatus = 'GENERATED';
          fpStr = fp.fingerprint;
          fpHash = fp.fingerprintHash;
          fpDur = fp.durationSec || aq.durationSec;

          const fpRecord = {
            id: 'fp_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
            releaseId: release.id,
            userId,
            trackIndex: 0,
            durationSec: fpDur,
            fingerprint: fpStr,
            fingerprintHash: fpHash,
            fileId: extractFileIdFromUrl(primaryTrack?.audioFileUrl) || undefined,
            createdAt: new Date().toISOString()
          };
          ctx.audioFingerprints.push(fpRecord);
          await dbSaveAudioFingerprint(fpRecord);
        } else {
          fpStatus = 'FAILED';
        }
      }
      return { aq, fpStatus, fpStr, fpHash, fpDur };
    });

    audioQuality = mediaResult.aq;
    fingerprintStatus = mediaResult.fpStatus;
    fingerprint = mediaResult.fpStr;
    fingerprintHash = mediaResult.fpHash;
    fpDurationSec = mediaResult.fpDur;
  }

  // Stage 4: Music Database Matching (AcoustID + Internal Duplicate Detection)
  await updateJobStage(job, 'Music Database Matching', 52);
  if (ctx.aiSettings.acoustIdMatchingEnabled && fingerprintStatus === 'GENERATED' && fingerprint) {
    acoustIdResult = await queryAcoustId(fingerprint, fpDurationSec || audioQuality.durationSec);
    if (acoustIdResult.status === 'MATCH_FOUND') {
      for (const m of acoustIdResult.matches.slice(0, 10)) {
        const matchRow = {
          id: 'aidm_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
          reviewId,
          releaseId: release.id,
          acoustidId: m.acoustidId,
          score: m.score,
          title: m.title,
          artist: m.artist,
          musicbrainzId: m.musicbrainzId,
          rawResponse: acoustIdResult.rawResponse,
          createdAt: new Date().toISOString()
        };
        await dbSaveAcoustIdMatch(matchRow);
      }
    }
  }

  // Internal Duplicate Detection (Module D)
  const duplicateMatches: Array<{ releaseId: string; title: string; artist: string; matchType: string }> = [];
  if (ctx.aiSettings.duplicateDetectionEnabled) {
    if (fingerprintHash) {
      for (const fp of ctx.audioFingerprints) {
        if (fp.releaseId !== release.id && fp.fingerprintHash === fingerprintHash) {
          const other = findReleaseOwner(ctx, fp.releaseId);
          duplicateMatches.push({
            releaseId: fp.releaseId,
            title: other?.release?.title || 'Unknown Release',
            artist: other?.release?.artist || 'Unknown Artist',
            matchType: 'EXACT_AUDIO_FINGERPRINT'
          });
        }
      }
    }
    for (const [, otherDash] of ctx.userDashboards.entries()) {
      for (const otherRel of otherDash.releases || []) {
        if (otherRel.id === release.id) continue;
        if (release.upc && otherRel.upc && release.upc === otherRel.upc) {
          duplicateMatches.push({
            releaseId: otherRel.id,
            title: otherRel.title,
            artist: otherRel.artist,
            matchType: 'DUPLICATE_UPC'
          });
        }
        const primaryIsrc = primaryTrack?.isrc;
        const otherIsrc = otherRel.tracks?.[0]?.isrc;
        if (primaryIsrc && otherIsrc && primaryIsrc === otherIsrc) {
          duplicateMatches.push({
            releaseId: otherRel.id,
            title: otherRel.title,
            artist: otherRel.artist,
            matchType: 'DUPLICATE_ISRC'
          });
        }
      }
    }
  }

  // Stage 5: AI Metadata & Artwork Review (Gemini)
  await updateJobStage(job, 'AI Metadata Review', 68);
  const artworkMedia = ctx.aiSettings.artworkReviewEnabled
    ? await loadMediaBuffer(release.artworkUrl || release.coverUrl, ctx.artworkUploadDir)
    : null;

  const geminiReport = await runGeminiComplianceReview({
    release,
    lyricsText: release.lyrics,
    artworkBuffer: artworkMedia?.buffer,
    artworkMimeType: artworkMedia?.mimeType,
    acoustIdResult,
    duplicateMatches,
    audioTechnical: audioQuality,
    enabled: ctx.aiSettings.geminiAnalysisEnabled
  });

  // Stage 6: Audio Quality Review
  await updateJobStage(job, 'Audio Quality Review', 82);

  // Stage 7: Copyright Risk Assessment
  await updateJobStage(job, 'Copyright Risk Assessment', 92);
  let riskLevel: RiskLevel = 'LOW';
  let confidenceScore = 88;
  const topAcoustScore = acoustIdResult.matches.reduce((max, m) => Math.max(max, m.score || 0), 0);

  const hasStrongAcoustMatch = topAcoustScore >= 0.85;
  const hasPartialAcoustMatch = topAcoustScore >= 0.5 && topAcoustScore < 0.85;
  const hasCriticalServiceFailure =
    acoustIdResult.status === 'ERROR' ||
    acoustIdResult.status === 'NOT_CONFIGURED' ||
    geminiReport.status === 'UNAVAILABLE' ||
    geminiReport.status === 'NOT_CONFIGURED' ||
    fingerprintStatus === 'FAILED' ||
    fingerprintStatus === 'NO_AUDIO';

  const rightsDecl = release.rightsDeclarations || {};
  const hasUncertainSampleOrCover =
    (rightsDecl.usesSamples && !rightsDecl.sampleLicenseConfirmed) ||
    (rightsDecl.isCoverSong && !rightsDecl.coverLicenseConfirmed) ||
    (rightsDecl.isRemix && !rightsDecl.remixPermissionConfirmed);

  if (hasStrongAcoustMatch || duplicateMatches.some(d => d.matchType === 'EXACT_AUDIO_FINGERPRINT')) {
    riskLevel = 'HIGH';
    confidenceScore = Math.round(topAcoustScore * 100) || 92;
  } else if (
    hasPartialAcoustMatch ||
    hasUncertainSampleOrCover ||
    duplicateMatches.length > 0 ||
    hasCriticalServiceFailure ||
    !audioQuality.valid ||
    geminiReport.riskSignals.length > 0
  ) {
    riskLevel = 'MEDIUM';
    confidenceScore = 72;
  } else {
    riskLevel = 'LOW';
    confidenceScore = 96;
  }

  // Automated Decision Policy
  let recommendedDecision: AiDecision = 'ADMIN REVIEW REQUIRED';
  let finalDecision: AiReviewResult['finalDecision'] = 'PENDING';
  let finalStage: AiStage = 'Admin Review';

  if (
    riskLevel === 'LOW' &&
    !hasCriticalServiceFailure &&
    audioQuality.valid &&
    ctx.aiSettings.autoApprovalEnabled &&
    confidenceScore >= (ctx.aiSettings.confidenceThreshold || 95)
  ) {
    recommendedDecision = 'AUTO APPROVED';
    finalDecision = 'APPROVED';
    finalStage = 'Approved';
    release.status = 'Approved';
    release.lastReviewedAt = new Date().toISOString();
    release.adminReviewNotes = 'Automatically approved by Rudraatma AI low-risk policy.';
  } else if (
    riskLevel === 'HIGH' &&
    ctx.aiSettings.autoRejectionEnabled &&
    !hasCriticalServiceFailure &&
    release.rightsConfirmed === false
  ) {
    recommendedDecision = 'REJECTED';
    finalDecision = 'REJECTED';
    finalStage = 'Rejected';
    release.status = 'Rejected';
    release.lastReviewedAt = new Date().toISOString();
    release.adminRejectReason = 'High-risk copyright match or missing rights confirmation.';
  } else {
    recommendedDecision = 'ADMIN REVIEW REQUIRED';
    finalDecision = 'PENDING';
    finalStage = 'Admin Review';
    if (release.status === 'Submitted') {
      release.status = 'Under Review';
    }
  }

  const result: AiReviewResult = {
    id: reviewId,
    jobId: job.id,
    releaseId: release.id,
    userId,
    riskLevel,
    recommendedDecision,
    finalDecision,
    confidenceScore,
    durationSec: fpDurationSec || audioQuality.durationSec,
    fingerprintStatus,
    fingerprintHash: fingerprintHash || undefined,
    acoustIdStatus: acoustIdResult.status,
    acoustIdMatches: acoustIdResult.matches,
    geminiReport,
    audioQuality,
    duplicateCheck: {
      hasDuplicates: duplicateMatches.length > 0,
      matches: duplicateMatches
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  ctx.aiResults.set(release.id, result);
  await dbSaveAiResult(result);
  await ctx.dbSaveDashboard(userId, dash);

  const complianceReport = {
    reviewId,
    releaseId: release.id,
    generatedAt: new Date().toISOString(),
    releaseInformation: {
      title: release.title,
      artist: release.artist,
      label: release.label,
      type: release.type,
      upc: release.upc,
      releaseDate: release.releaseDate,
      language: release.language,
      primaryGenre: release.primaryGenre
    },
    audioTechnicalAnalysis: audioQuality,
    fingerprintInformation: {
      status: fingerprintStatus,
      durationSec: fpDurationSec || audioQuality.durationSec,
      fingerprintHash: fingerprintHash || null
    },
    acoustIdMatchingResults: {
      status: acoustIdResult.status,
      matchesCount: acoustIdResult.matches.length,
      matches: acoustIdResult.matches
    },
    duplicateDetection: result.duplicateCheck,
    copyrightRiskAssessment: {
      riskLevel,
      confidenceScore,
      recommendedDecision,
      explanation: geminiReport.copyrightRiskExplanation
    },
    metadataValidation: geminiReport.metadataAccuracyReport,
    artworkValidation: geminiReport.artworkComplianceReport,
    distributionCompliance: geminiReport.distributionPolicyReport,
    aiRecommendations: geminiReport.recommendedAction,
    adminDecision: finalDecision,
    disclaimer: geminiReport.disclaimer
  };

  ctx.complianceReports.set(release.id, complianceReport);
  await dbSaveComplianceReport({
    id: 'rep_' + Date.now(),
    reviewId,
    releaseId: release.id,
    reportData: complianceReport,
    createdAt: new Date().toISOString()
  });

  await appendReviewHistory(ctx, {
    releaseId: release.id,
    actorEmail: 'ai-engine@rudraatmamusic.com',
    actorRole: 'AI_ENGINE',
    action: 'AI_SCAN_COMPLETED',
    previousStatus: 'Submitted',
    newStatus: release.status,
    notes: `Risk: ${riskLevel} | AcoustID: ${acoustIdResult.status} | Recommended: ${recommendedDecision}`
  });

  await updateJobStage(job, finalStage, 100);
}
