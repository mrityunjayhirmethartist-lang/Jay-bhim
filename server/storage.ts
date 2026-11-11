import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getDbPool, isDatabaseEnabled } from './db';

const s3Bucket = process.env.S3_BUCKET?.trim();
const s3Endpoint = process.env.S3_ENDPOINT?.trim();
const s3Region = process.env.S3_REGION?.trim() || 'auto';
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
const s3PublicUrl = process.env.S3_PUBLIC_URL?.trim()?.replace(/\/+$/, '');

const isS3Configured = Boolean(s3Bucket && s3AccessKeyId && s3SecretAccessKey);

const s3Client = isS3Configured
  ? new S3Client({
      region: s3Region,
      endpoint: s3Endpoint || undefined,
      credentials: {
        accessKeyId: s3AccessKeyId!,
        secretAccessKey: s3SecretAccessKey!
      },
      forcePathStyle: Boolean(s3Endpoint)
    })
  : null;

const s3MemoryIndex = new Map<string, { originalName: string; mimeType: string; storageKey: string }>();

export interface StoredMediaResult {
  id: string;
  fileUrl: string;
  fileName: string;
  size: number;
  mimeType: string;
  storageProvider: 's3' | 'postgres' | 'local';
}

export function getStorageProviderName(): 's3' | 'postgres' | 'local' {
  if (isS3Configured) return 's3';
  if (isDatabaseEnabled()) return 'postgres';
  return 'local';
}

/**
 * Persists an uploaded audio or artwork file to:
 * 1. S3-compatible object storage (Cloudflare R2 / AWS S3 / Backblaze) if S3_* env vars are set
 * 2. PostgreSQL BYTEA table if DATABASE_URL is configured (survives Render restarts!)
 * 3. Local disk in development mode only
 */
export async function saveUploadedMedia(params: {
  userId: string;
  category: 'audio' | 'artwork' | 'kyc' | 'lyrics' | 'evidence';
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  localUploadDir: string;
}): Promise<StoredMediaResult> {
  const { userId, category, originalName, mimeType, buffer, localUploadDir } = params;
  const ext = path.extname(originalName).toLowerCase() || (category === 'audio' ? '.wav' : '.jpg');
  const fileId = `${category}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const storageKey = `${category}/${fileId}${ext}`;

  // 1. S3-Compatible Object Storage
  if (s3Client && s3Bucket) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType
      })
    );

    if (isDatabaseEnabled()) {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO uploaded_files (id, user_id, category, original_name, mime_type, size_bytes, storage_provider, storage_key)
         VALUES ($1, $2, $3, $4, $5, $6, 's3', $7)`,
        [fileId, userId, category, originalName, mimeType, buffer.length, storageKey]
      );
    } else {
      s3MemoryIndex.set(fileId, { originalName, mimeType, storageKey });
    }

    const fileUrl =
      category === 'kyc'
        ? `/api/super-admin/kyc/document/${fileId}`
        : category === 'evidence'
          ? `/api/ai/evidence/${fileId}`
          : s3PublicUrl
            ? `${s3PublicUrl}/${storageKey}`
            : `/api/media/${fileId}`;
    return {
      id: fileId,
      fileUrl,
      fileName: originalName,
      size: buffer.length,
      mimeType,
      storageProvider: 's3'
    };
  }

  // 2. PostgreSQL Persistent Blob Storage (survives Render ephemeral filesystem resets)
  if (isDatabaseEnabled()) {
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO uploaded_files (id, user_id, category, original_name, mime_type, size_bytes, storage_provider, storage_key, file_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, 'postgres', $7, $8)`,
      [fileId, userId, category, originalName, mimeType, buffer.length, storageKey, buffer]
    );

    return {
      id: fileId,
      fileUrl: category === 'kyc' ? `/api/super-admin/kyc/document/${fileId}` : `/api/media/${fileId}`,
      fileName: originalName,
      size: buffer.length,
      mimeType,
      storageProvider: 'postgres'
    };
  }

  // 3. Local Disk Fallback (Development Only)
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Persistent object storage (S3_* or DATABASE_URL) is required in production. Refusing to store files on ephemeral local disk.'
    );
  }

  fs.mkdirSync(localUploadDir, { recursive: true });
  const localFilename = `${fileId}${ext}`;
  const fullPath = path.join(localUploadDir, localFilename);
  fs.writeFileSync(fullPath, buffer);

  return {
    id: fileId,
    fileUrl: category === 'kyc' ? `/api/super-admin/kyc/document/${fileId}` : `/uploads/${category}/${localFilename}`,
    fileName: originalName,
    size: buffer.length,
    mimeType,
    storageProvider: 'local'
  };
}

/**
 * Retrieves stored media from S3 or PostgreSQL by fileId
 */
export async function getStoredMedia(fileId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  originalName: string;
} | null> {
  if (!isDatabaseEnabled()) {
    const memEntry = s3MemoryIndex.get(fileId);
    if (memEntry && s3Client && s3Bucket) {
      const obj = await s3Client.send(
        new GetObjectCommand({
          Bucket: s3Bucket,
          Key: memEntry.storageKey
        })
      );
      const byteArray = await obj.Body?.transformToByteArray();
      if (!byteArray) return null;
      return {
        buffer: Buffer.from(byteArray),
        mimeType: memEntry.mimeType,
        originalName: memEntry.originalName
      };
    }
    return null;
  }

  const pool = getDbPool();
  const result = await pool.query(
    'SELECT original_name, mime_type, storage_provider, storage_key, file_bytes FROM uploaded_files WHERE id = $1',
    [fileId]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  if (row.storage_provider === 's3' && s3Client && s3Bucket) {
    const obj = await s3Client.send(
      new GetObjectCommand({
        Bucket: s3Bucket,
        Key: row.storage_key
      })
    );
    const byteArray = await obj.Body?.transformToByteArray();
    if (!byteArray) return null;
    return {
      buffer: Buffer.from(byteArray),
      mimeType: row.mime_type,
      originalName: row.original_name
    };
  }

  if (row.file_bytes) {
    return {
      buffer: Buffer.isBuffer(row.file_bytes) ? row.file_bytes : Buffer.from(row.file_bytes),
      mimeType: row.mime_type,
      originalName: row.original_name
    };
  }

  return null;
}
