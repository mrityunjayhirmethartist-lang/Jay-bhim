import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { isDatabaseEnabled, getDbPool, dbSaveAiServiceSetting, dbSaveReleaseAppeal, dbSaveAiResult, dbSaveNotification } from '../db';
import { saveUploadedMedia, getStoredMedia, getStorageProviderName } from '../storage';
import { checkFfmpegBinary, checkChromaprintBinary } from './audioEngine';
import { testGeminiConnection } from './geminiReview';
import {
  AiQueueContext,
  enqueueAiReviewJob,
  findReleaseOwner,
  appendReviewHistory,
  appendAiAudit
} from './reviewQueue';

export function registerAiRoutes(
  app: express.Express,
  ctx: AiQueueContext & {
    getAuthenticatedUser: (req: express.Request) => any;
    notifications: Map<string, any>;
    localLyricsDir: string;
    localEvidenceDir: string;
  }
) {
  const docUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for lyrics/evidence documents
  });

  function requireSuperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = ctx.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });
    if (user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access forbidden. SUPER_ADMIN role required.' });
    }
    (req as any).superAdmin = user;
    next();
  }

  // ======================== USER AI STATUS, REPORTS, RESUBMISSION & APPEALS ========================

  app.get('/api/ai/releases/:releaseId/status', (req, res) => {
    const user = ctx.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const { releaseId } = req.params;
    const found = findReleaseOwner(ctx, releaseId);
    if (!found) return res.status(404).json({ error: 'Release not found.' });
    if (found.userId !== user.id && user.role !== 'SUPER_ADMIN' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Access forbidden.' });
    }

    // Find latest job
    let latestJob: any = null;
    for (const j of ctx.aiJobs.values()) {
      if (j.releaseId === releaseId) {
        if (!latestJob || j.createdAt > latestJob.createdAt) latestJob = j;
      }
    }

    const result = ctx.aiResults.get(releaseId);
    const appeals = ctx.releaseAppeals.filter(a => a.releaseId === releaseId);

    // Determine user-facing stage & friendly message (never expose confidential internal reference matches)
    let stage = latestJob?.stage || 'Release Submitted';
    let progress = latestJob?.progress ?? 10;
    if (found.release.status === 'Approved' || found.release.status === 'Live') {
      stage = 'Approved';
      progress = 100;
    } else if (found.release.status === 'Rejected') {
      stage = 'Rejected';
      progress = 100;
    }

    let userMessage = 'Your release has been submitted successfully.';
    if (latestJob?.status === 'processing') {
      userMessage = 'Our AI system is analyzing your audio and release information.';
    } else if (stage === 'Admin Review') {
      userMessage =
        result?.riskLevel === 'LOW'
          ? 'Your release has passed the preliminary review and is awaiting final verification.'
          : 'Your release is awaiting manual verification by our distribution desk.';
    } else if (found.release.status === 'Action Required') {
      userMessage = 'Your release requires additional documentation or metadata corrections.';
    } else if (found.release.status === 'Approved' || found.release.status === 'Live') {
      userMessage = 'Your release has been approved for distribution.';
    } else if (found.release.status === 'Rejected') {
      userMessage = 'Your release was not approved. Review the explanation below to fix or submit an appeal.';
    }

    return res.json({
      releaseId,
      releaseStatus: found.release.status,
      stage,
      progress,
      jobStatus: latestJob?.status || 'none',
      userMessage,
      rejectionReason: found.release.adminRejectReason || null,
      changesRequired: found.release.adminChangesRequired || null,
      audioTechnicalWarnings: result?.audioQuality?.warnings || [],
      missingInformationReport: result?.geminiReport?.missingInformationReport || null,
      appealsCount: appeals.length,
      latestAppeal: appeals[appeals.length - 1] || null
    });
  });

  app.post('/api/ai/upload/lyrics', docUpload.single('file'), async (req, res) => {
    const user = ctx.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });
    if (!req.file) return res.status(400).json({ error: 'No lyrics file uploaded.' });

    const allowed = ['text/plain', 'application/pdf', 'application/octet-stream'];
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!allowed.includes(req.file.mimetype) && !['.txt', '.lrc', '.pdf'].includes(ext)) {
      return res.status(400).json({ error: 'Only .txt, .lrc, or .pdf lyrics documents are supported.' });
    }

    const stored = await saveUploadedMedia({
      userId: user.id,
      category: 'lyrics',
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
      localUploadDir: ctx.localLyricsDir
    });

    const extractedText = ext === '.txt' || ext === '.lrc' ? req.file.buffer.toString('utf8').slice(0, 10000) : undefined;
    return res.json({ success: true, fileId: stored.id, fileUrl: stored.fileUrl, fileName: stored.fileName, extractedText });
  });

  app.post('/api/ai/upload/evidence', docUpload.single('file'), async (req, res) => {
    const user = ctx.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });
    if (!req.file) return res.status(400).json({ error: 'No document file uploaded.' });

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only JPG, PNG, WebP, or PDF licensing documents are accepted (max 5MB).' });
    }

    const stored = await saveUploadedMedia({
      userId: user.id,
      category: 'evidence',
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
      localUploadDir: ctx.localEvidenceDir
    });

    return res.json({ success: true, fileId: stored.id, fileUrl: stored.fileUrl, fileName: stored.fileName });
  });

  app.get('/api/ai/evidence/:fileId', async (req, res) => {
    const user = ctx.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });
    const { fileId } = req.params;

    // Allow owning user or SUPER_ADMIN
    const ownsEvidence = ctx.releaseAppeals.some(
      a => a.userId === user.id && (a.evidenceFiles || []).some((f: any) => f.fileId === fileId)
    );
    if (user.role !== 'SUPER_ADMIN' && !ownsEvidence) {
      return res.status(403).json({ error: 'Access forbidden to licensing evidence document.' });
    }

    const stored = await getStoredMedia(fileId);
    if (stored) {
      res.setHeader('Content-Type', stored.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${stored.originalName}"`);
      return res.send(stored.buffer);
    }

    if (fs.existsSync(ctx.localEvidenceDir)) {
      const files = fs.readdirSync(ctx.localEvidenceDir);
      const match = files.find(f => f.startsWith(fileId));
      if (match) return res.sendFile(path.join(ctx.localEvidenceDir, match));
    }

    return res.status(404).json({ error: 'Evidence file not found.' });
  });

  // Submit Appeal
  app.post('/api/ai/releases/:releaseId/appeal', async (req, res) => {
    const user = ctx.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const { releaseId } = req.params;
    const found = findReleaseOwner(ctx, releaseId);
    if (!found || found.userId !== user.id) {
      return res.status(404).json({ error: 'Release not found.' });
    }

    const { explanation, correctedMetadata, evidenceFiles } = req.body || {};
    if (!explanation || !String(explanation).trim()) {
      return res.status(400).json({ error: 'Ownership explanation is required to submit an appeal.' });
    }

    const appeal = {
      id: 'apl_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      releaseId,
      userId: user.id,
      userEmail: user.email,
      explanation: String(explanation).trim(),
      correctedMetadata: correctedMetadata || null,
      evidenceFiles: Array.isArray(evidenceFiles) ? evidenceFiles : [],
      status: 'Pending',
      createdAt: new Date().toISOString()
    };

    ctx.releaseAppeals.push(appeal);
    await dbSaveReleaseAppeal(appeal);

    found.release.status = 'Under Review';
    await ctx.dbSaveDashboard(user.id, found.dash);

    await appendReviewHistory(ctx, {
      releaseId,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'APPEAL_SUBMITTED',
      previousStatus: 'Rejected',
      newStatus: 'Under Review',
      notes: appeal.explanation.slice(0, 300)
    });

    await appendAiAudit(ctx, user.email, user.role, 'APPEAL_SUBMITTED', releaseId, `User submitted appeal ${appeal.id}`);
    return res.json({ success: true, appeal });
  });

  // Corrected Resubmission (updates metadata & triggers fresh AI scan)
  app.post('/api/ai/releases/:releaseId/resubmit', async (req, res) => {
    const user = ctx.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const { releaseId } = req.params;
    const found = findReleaseOwner(ctx, releaseId);
    if (!found || found.userId !== user.id) {
      return res.status(404).json({ error: 'Release not found.' });
    }

    const { title, artist, lyrics, rightsConfirmed, rightsDeclarations } = req.body || {};
    const prevStatus = found.release.status;
    if (title) found.release.title = String(title).trim();
    if (artist) found.release.artist = String(artist).trim();
    if (typeof lyrics === 'string') found.release.lyrics = lyrics;
    if (typeof rightsConfirmed === 'boolean') found.release.rightsConfirmed = rightsConfirmed;
    if (rightsDeclarations) found.release.rightsDeclarations = rightsDeclarations;

    found.release.status = 'Submitted';
    found.release.adminRejectReason = undefined;
    found.release.adminChangesRequired = undefined;
    await ctx.dbSaveDashboard(user.id, found.dash);

    await appendReviewHistory(ctx, {
      releaseId,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'CORRECTED_RESUBMISSION',
      previousStatus: prevStatus,
      newStatus: 'Submitted',
      notes: 'User submitted corrected release details for re-evaluation.'
    });

    let job = null;
    if (ctx.aiSettings.aiReviewEnabled) {
      job = enqueueAiReviewJob(ctx, user.id, releaseId);
    }

    return res.json({ success: true, release: found.release, job });
  });

  // Downloadable Compliance Report
  app.get('/api/ai/releases/:releaseId/report', (req, res) => {
    const user = ctx.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const { releaseId } = req.params;
    const found = findReleaseOwner(ctx, releaseId);
    if (!found) return res.status(404).json({ error: 'Release not found.' });
    if (found.userId !== user.id && user.role !== 'SUPER_ADMIN' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Access forbidden.' });
    }

    const report = ctx.complianceReports.get(releaseId);
    if (!report) {
      return res.status(404).json({ error: 'Compliance report is not ready yet.' });
    }

    const history = ctx.reviewHistory.filter(h => h.releaseId === releaseId);
    const fullReport = {
      ...report,
      reviewHistory: history
    };

    // Sanitize internal reference match details if requester is non-admin
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'admin') {
      fullReport.acoustIdMatchingResults = {
        status: report.acoustIdMatchingResults?.status,
        matchesCount: report.acoustIdMatchingResults?.matchesCount || 0,
        note: 'Detailed third-party reference records are restricted to compliance administrators.'
      };
    }

    res.setHeader('Content-Disposition', `attachment; filename="Rudraatma_Compliance_Report_${releaseId}.json"`);
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify(fullReport, null, 2));
  });

  // ======================== SUPER ADMIN AI CONTROL CENTER ========================

  app.get('/api/super-admin/ai/overview', requireSuperAdmin, (_req, res) => {
    const results = Array.from(ctx.aiResults.values());
    const jobs = Array.from(ctx.aiJobs.values());

    let completedDurations = 0;
    let completedCount = 0;
    for (const j of jobs) {
      if (j.status === 'completed' && j.startedAt && j.completedAt) {
        completedDurations += new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime();
        completedCount++;
      }
    }

    const stats = {
      totalAiScans: jobs.length,
      pendingAiReviews: results.filter(r => r.finalDecision === 'PENDING').length,
      lowRiskReleases: results.filter(r => r.riskLevel === 'LOW').length,
      mediumRiskReleases: results.filter(r => r.riskLevel === 'MEDIUM').length,
      highRiskReleases: results.filter(r => r.riskLevel === 'HIGH').length,
      approvedReleases: results.filter(r => r.finalDecision === 'APPROVED').length,
      rejectedReleases: results.filter(r => r.finalDecision === 'REJECTED').length,
      failedScans: jobs.filter(j => j.status === 'failed').length,
      avgReviewTimeSec: completedCount > 0 ? Math.round(completedDurations / completedCount / 1000) : 0,
      potentialCopyrightMatches: results.filter(
        r => r.acoustIdStatus === 'MATCH_FOUND' || r.duplicateCheck?.hasDuplicates
      ).length
    };

    return res.json({ stats });
  });

  app.get('/api/super-admin/ai/reviews', requireSuperAdmin, (req, res) => {
    const riskFilter = String(req.query.risk || 'all').toUpperCase();
    const q = String(req.query.q || '').trim().toLowerCase();

    const items: any[] = [];
    for (const u of ctx.users.values()) {
      if (u.role === 'SUPER_ADMIN') continue;
      const dash = ctx.userDashboards.get(u.id);
      for (const rel of dash?.releases || []) {
        const aiRes = ctx.aiResults.get(rel.id);
        let latestJob: any = null;
        for (const j of ctx.aiJobs.values()) {
          if (j.releaseId === rel.id && (!latestJob || j.createdAt > latestJob.createdAt)) latestJob = j;
        }
        const appeals = ctx.releaseAppeals.filter(a => a.releaseId === rel.id);

        const row = {
          releaseId: rel.id,
          title: rel.title,
          artist: rel.artist,
          userId: u.id,
          userEmail: u.email,
          submittedAt: rel.submittedAt,
          releaseStatus: rel.status,
          durationSec: aiRes?.durationSec || 0,
          riskLevel: aiRes?.riskLevel || 'PENDING',
          acoustIdStatus: aiRes?.acoustIdStatus || 'NOT_SCANNED',
          acoustIdMatchesCount: aiRes?.acoustIdMatches?.length || 0,
          duplicateCount: aiRes?.duplicateCheck?.matches?.length || 0,
          metadataStatus: aiRes?.geminiReport?.status || 'PENDING',
          audioQualityValid: aiRes?.audioQuality?.valid ?? null,
          recommendedDecision: aiRes?.recommendedDecision || 'ADMIN REVIEW REQUIRED',
          finalDecision: aiRes?.finalDecision || 'PENDING',
          jobStatus: latestJob?.status || 'none',
          jobStage: latestJob?.stage || 'Release Submitted',
          pendingAppeals: appeals.filter(a => a.status === 'Pending').length
        };

        if (riskFilter !== 'ALL' && row.riskLevel !== riskFilter) continue;
        if (
          q &&
          !row.title.toLowerCase().includes(q) &&
          !row.artist.toLowerCase().includes(q) &&
          !row.userEmail.toLowerCase().includes(q) &&
          !row.releaseId.toLowerCase().includes(q)
        ) {
          continue;
        }
        items.push(row);
      }
    }

    items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    return res.json({ reviews: items });
  });

  app.get('/api/super-admin/ai/reviews/:releaseId', requireSuperAdmin, (req, res) => {
    const { releaseId } = req.params;
    const found = findReleaseOwner(ctx, releaseId);
    if (!found) return res.status(404).json({ error: 'Release not found.' });

    const owner = Array.from(ctx.users.values()).find(u => u.id === found.userId);
    const aiResult = ctx.aiResults.get(releaseId) || null;
    const report = ctx.complianceReports.get(releaseId) || null;
    const history = ctx.reviewHistory.filter(h => h.releaseId === releaseId);
    const appeals = ctx.releaseAppeals.filter(a => a.releaseId === releaseId);

    return res.json({
      release: found.release,
      owner: owner ? { id: owner.id, fullName: owner.fullName, email: owner.email } : null,
      aiResult,
      report,
      history,
      appeals
    });
  });

  app.post('/api/super-admin/ai/reviews/:releaseId/action', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { releaseId } = req.params;
    const { action, reason, notes, appealId, appealDecision } = req.body || {};

    const found = findReleaseOwner(ctx, releaseId);
    if (!found) return res.status(404).json({ error: 'Release not found.' });

    const aiResult = ctx.aiResults.get(releaseId);
    const prevStatus = found.release.status;

    if (action === 'rerun_scan') {
      const job = enqueueAiReviewJob(ctx, found.userId, releaseId);
      await appendReviewHistory(ctx, {
        releaseId,
        actorEmail: admin.email,
        actorRole: 'SUPER_ADMIN',
        action: 'RERUN_AI_SCAN',
        previousStatus: prevStatus,
        newStatus: prevStatus,
        notes: 'Super Admin triggered a fresh AI scan.'
      });
      await appendAiAudit(ctx, admin.email, 'SUPER_ADMIN', 'RERUN_AI_SCAN', releaseId, `Triggered re-scan job ${job.id}`);
      return res.json({ success: true, job });
    }

    if (action === 'add_note') {
      if (aiResult) {
        aiResult.internalNotes = String(notes || '').trim();
        aiResult.updatedAt = new Date().toISOString();
        await dbSaveAiResult(aiResult);
      }
      await appendReviewHistory(ctx, {
        releaseId,
        actorEmail: admin.email,
        actorRole: 'SUPER_ADMIN',
        action: 'INTERNAL_NOTE_ADDED',
        notes: String(notes || '').trim()
      });
      return res.json({ success: true });
    }

    if (action === 'review_appeal' && appealId) {
      const appeal = ctx.releaseAppeals.find(a => a.id === appealId && a.releaseId === releaseId);
      if (!appeal) return res.status(404).json({ error: 'Appeal not found.' });
      appeal.status = appealDecision === 'approve' ? 'Approved' : 'Rejected';
      appeal.adminNotes = String(reason || notes || '').trim();
      appeal.reviewedBy = admin.email;
      appeal.reviewedAt = new Date().toISOString();
      await dbSaveReleaseAppeal(appeal);

      if (appealDecision === 'approve') {
        found.release.status = 'Approved';
        found.release.adminRejectReason = undefined;
        if (aiResult) {
          aiResult.finalDecision = 'APPROVED';
          aiResult.reviewerId = admin.email;
          await dbSaveAiResult(aiResult);
        }
      } else {
        found.release.status = 'Rejected';
      }
      await ctx.dbSaveDashboard(found.userId, found.dash);
      await appendReviewHistory(ctx, {
        releaseId,
        actorEmail: admin.email,
        actorRole: 'SUPER_ADMIN',
        action: `APPEAL_${appeal.status.toUpperCase()}`,
        previousStatus: prevStatus,
        newStatus: found.release.status,
        notes: appeal.adminNotes
      });
      await appendAiAudit(ctx, admin.email, 'SUPER_ADMIN', `APPEAL_${appeal.status.toUpperCase()}`, releaseId, `Appeal ${appeal.id}: ${appeal.adminNotes}`);
      return res.json({ success: true, appeal, releaseStatus: found.release.status });
    }

    // Standard admin decisions / overrides
    if (action === 'approve' || action === 'override_approve') {
      found.release.status = 'Approved';
      found.release.lastReviewedAt = new Date().toISOString();
      found.release.adminReviewNotes = notes || reason || 'Approved by Super Admin';
      found.release.adminRejectReason = undefined;
      found.release.adminChangesRequired = undefined;
      if (aiResult) {
        aiResult.finalDecision = 'APPROVED';
        aiResult.reviewerId = admin.email;
        aiResult.updatedAt = new Date().toISOString();
        await dbSaveAiResult(aiResult);
      }
    } else if (action === 'reject' || action === 'override_reject') {
      if (!reason || !String(reason).trim()) {
        return res.status(400).json({ error: 'A rejection reason is required.' });
      }
      found.release.status = 'Rejected';
      found.release.lastReviewedAt = new Date().toISOString();
      found.release.adminRejectReason = String(reason).trim();
      if (aiResult) {
        aiResult.finalDecision = 'REJECTED';
        aiResult.reviewerId = admin.email;
        aiResult.updatedAt = new Date().toISOString();
        await dbSaveAiResult(aiResult);
      }
    } else if (action === 'request_corrections' || action === 'request_rights_docs') {
      if (!reason || !String(reason).trim()) {
        return res.status(400).json({ error: 'Please specify the required corrections or rights documents.' });
      }
      found.release.status = 'Action Required';
      found.release.lastReviewedAt = new Date().toISOString();
      found.release.adminChangesRequired = String(reason).trim();
      if (aiResult) {
        aiResult.finalDecision = action === 'request_rights_docs' ? 'DOCS_REQUESTED' : 'CORRECTIONS_REQUESTED';
        aiResult.reviewerId = admin.email;
        aiResult.updatedAt = new Date().toISOString();
        await dbSaveAiResult(aiResult);
      }
    } else {
      return res.status(400).json({ error: 'Invalid AI review action.' });
    }

    await ctx.dbSaveDashboard(found.userId, found.dash);

    // Notify user
    const notif = {
      id: 'ainotif_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      recipient_user_id: found.userId,
      release_id: releaseId,
      notification_type: found.release.status === 'Approved' ? 'approved' : found.release.status === 'Rejected' ? 'rejected' : 'changes_requested',
      title: `Release ${found.release.status}`,
      message: reason ? `${found.release.title}: ${reason}` : `Your release "${found.release.title}" status is now ${found.release.status}.`,
      admin_reason: reason || notes || '',
      release_title: found.release.title,
      artist_name: found.release.artist,
      created_at: new Date().toISOString(),
      expires_at: Date.now() + 72 * 3600 * 1000
    };
    ctx.notifications.set(notif.id, notif);
    await dbSaveNotification({ ...notif, userId: found.userId });

    await appendReviewHistory(ctx, {
      releaseId,
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      action: action.toUpperCase(),
      previousStatus: prevStatus,
      newStatus: found.release.status,
      notes: reason || notes || ''
    });

    await appendAiAudit(
      ctx,
      admin.email,
      'SUPER_ADMIN',
      action.toUpperCase(),
      releaseId,
      `${found.release.title}: ${prevStatus} -> ${found.release.status}${reason ? ` | ${reason}` : ''}`
    );

    return res.json({ success: true, release: found.release, aiResult });
  });

  // ======================== AI CONFIGURATION SETTINGS & STATUS ========================

  app.get('/api/super-admin/ai/settings', requireSuperAdmin, async (_req, res) => {
    const [ffmpeg, chromaprint] = await Promise.all([checkFfmpegBinary(), checkChromaprintBinary()]);

    let dbConnected = !isDatabaseEnabled();
    if (isDatabaseEnabled()) {
      try {
        await getDbPool().query('SELECT 1');
        dbConnected = true;
      } catch {
        dbConnected = false;
      }
    }

    return res.json({
      settings: ctx.aiSettings,
      integrations: {
        gemini: process.env.GEMINI_API_KEY?.trim() ? 'Connected' : 'Not Configured',
        acoustid: process.env.ACOUSTID_CLIENT_KEY?.trim() ? 'Connected' : 'Not Configured',
        chromaprint: chromaprint.installed ? `Installed (${chromaprint.version})` : 'Not Installed',
        ffmpeg: ffmpeg.installed ? `Installed (${ffmpeg.version})` : 'Not Installed',
        database: isDatabaseEnabled() ? (dbConnected ? 'Connected' : 'Error') : 'In-Memory Dev Mode',
        storage: getStorageProviderName().toUpperCase()
      }
    });
  });

  app.put('/api/super-admin/ai/settings', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const body = req.body || {};

    const booleanKeys = [
      'aiReviewEnabled',
      'geminiAnalysisEnabled',
      'audioFingerprintingEnabled',
      'acoustIdMatchingEnabled',
      'duplicateDetectionEnabled',
      'artworkReviewEnabled',
      'metadataReviewEnabled',
      'autoApprovalEnabled',
      'autoRejectionEnabled'
    ] as const;

    for (const k of booleanKeys) {
      if (typeof body[k] === 'boolean') {
        (ctx.aiSettings as any)[k] = body[k];
      }
    }

    if (typeof body.confidenceThreshold === 'number') {
      ctx.aiSettings.confidenceThreshold = Math.max(50, Math.min(100, body.confidenceThreshold));
    }
    if (typeof body.maxAudioFileSizeMB === 'number') {
      ctx.aiSettings.maxAudioFileSizeMB = Math.max(10, Math.min(500, body.maxAudioFileSizeMB));
    }
    if (typeof body.jobConcurrency === 'number') {
      ctx.aiSettings.jobConcurrency = Math.max(1, Math.min(5, body.jobConcurrency));
    }

    await dbSaveAiServiceSetting('ai_service_settings', ctx.aiSettings);
    await appendAiAudit(
      ctx,
      admin.email,
      'SUPER_ADMIN',
      'AI_SETTINGS_UPDATED',
      undefined,
      `Updated AI settings: autoApproval=${ctx.aiSettings.autoApprovalEnabled}, autoRejection=${ctx.aiSettings.autoRejectionEnabled}, threshold=${ctx.aiSettings.confidenceThreshold}`
    );

    return res.json({ success: true, settings: ctx.aiSettings });
  });

  app.post('/api/super-admin/ai/test-connection', requireSuperAdmin, async (req, res) => {
    const service = String(req.body?.service || '').toLowerCase();

    if (service === 'gemini') {
      const r = await testGeminiConnection();
      return res.json({ service: 'gemini', ok: r.connected, status: r.connected ? 'Connected' : 'Error', message: r.message });
    }

    if (service === 'acoustid') {
      const key = process.env.ACOUSTID_CLIENT_KEY?.trim();
      if (!key) {
        return res.json({ service: 'acoustid', ok: false, status: 'Not Configured', message: 'ACOUSTID_CLIENT_KEY is not set.' });
      }
      try {
        // Test reachability to AcoustID API without exposing key
        const r = await fetch('https://api.acoustid.org/v2/lookup?client=' + encodeURIComponent(key) + '&duration=10&fingerprint=test', {
          signal: AbortSignal.timeout(8000)
        });
        const data = await r.json();
        // Invalid fingerprint returns error code 3 ("invalid fingerprint"), which proves API key & connectivity work; invalid API key returns code 4
        const code = data?.error?.code;
        if (code === 4) {
          return res.json({ service: 'acoustid', ok: false, status: 'Error', message: 'Invalid AcoustID client key.' });
        }
        return res.json({ service: 'acoustid', ok: true, status: 'Connected', message: 'AcoustID API reachable and client key accepted.' });
      } catch (err: any) {
        return res.json({ service: 'acoustid', ok: false, status: 'Error', message: err.message || 'AcoustID network error.' });
      }
    }

    if (service === 'chromaprint') {
      const r = await checkChromaprintBinary();
      return res.json({
        service: 'chromaprint',
        ok: r.installed,
        status: r.installed ? 'Installed' : 'Not Installed',
        message: r.installed ? `${r.version} (${r.path})` : r.error
      });
    }

    if (service === 'ffmpeg') {
      const r = await checkFfmpegBinary();
      return res.json({
        service: 'ffmpeg',
        ok: r.installed,
        status: r.installed ? 'Installed' : 'Not Installed',
        message: r.installed ? `${r.version} (${r.path})` : r.error
      });
    }

    if (service === 'database') {
      if (!isDatabaseEnabled()) {
        return res.json({ service: 'database', ok: true, status: 'Connected', message: 'Running in local in-memory mode (DATABASE_URL not set).' });
      }
      try {
        await getDbPool().query('SELECT 1');
        return res.json({ service: 'database', ok: true, status: 'Connected', message: 'PostgreSQL connection healthy.' });
      } catch (err: any) {
        return res.json({ service: 'database', ok: false, status: 'Error', message: err.message });
      }
    }

    if (service === 'storage') {
      const provider = getStorageProviderName();
      return res.json({ service: 'storage', ok: true, status: 'Connected', message: `Active storage provider: ${provider}` });
    }

    return res.status(400).json({ error: 'Unknown service name.' });
  });
}
