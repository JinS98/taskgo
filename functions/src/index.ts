import { createHash, randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import nodemailer from 'nodemailer';

initializeApp();
const db = getFirestore();
const region = 'asia-northeast3';
const smtpUrl = defineSecret('INVITE_SMTP_URL');
const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function field(data: unknown, key: string): string {
  const value = data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined;
  if (typeof value !== 'string' || !value.trim()) throw new HttpsError('invalid-argument', `${key} 값이 필요합니다.`);
  return value.trim();
}

async function verifiedUser(request: CallableRequest<unknown>): Promise<UserRecord> {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  const user = await getAuth().getUser(request.auth.uid);
  if (user.disabled || !user.email || !user.emailVerified) throw new HttpsError('permission-denied', '확인된 활성 이메일 계정이 필요합니다.');
  return user;
}

async function ownerWorkspace(workspaceId: string, uid: string) {
  const workspace = await db.doc(`workspaces/${workspaceId}`).get();
  if (!workspace.exists || workspace.get('ownerId') !== uid) throw new HttpsError('permission-denied', '워크스페이스 장만 초대를 관리할 수 있습니다.');
  return workspace;
}

function inviteLink(inviteId: string, token: string): string {
  const base = process.env.INVITE_APP_URL || (process.env.FUNCTIONS_EMULATOR === 'true' ? 'http://localhost:5173' : '');
  if (!base || (process.env.FUNCTIONS_EMULATOR !== 'true' && !base.startsWith('https://'))) {
    throw new HttpsError('failed-precondition', '초대 링크 HTTPS 주소가 설정되지 않았습니다.');
  }
  const url = new URL(`/invite/${inviteId}`, base);
  url.searchParams.set('token', token);
  return url.toString();
}

export const inviteMember = onCall({ region, secrets: [smtpUrl] }, async (request) => {
  const user = await verifiedUser(request);
  const workspaceId = field(request.data, 'workspaceId');
  const invitedEmail = field(request.data, 'email').toLowerCase();
  if (!/^[^@\s]+@(gmail\.com|googlemail\.com)$/.test(invitedEmail)) {
    throw new HttpsError('invalid-argument', 'Gmail 주소만 초대할 수 있습니다.');
  }
  const workspace = await ownerWorkspace(workspaceId, user.uid);
  if (user.email!.toLowerCase() === invitedEmail) throw new HttpsError('already-exists', '본인은 이미 워크스페이스 멤버입니다.');
  try {
    const existing = await getAuth().getUserByEmail(invitedEmail);
    if ((await workspace.ref.collection('members').doc(existing.uid).get()).exists) {
      throw new HttpsError('already-exists', '이미 워크스페이스 멤버입니다.');
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }

  const token = randomBytes(32).toString('base64url');
  const invite = db.collection('workspaceInvites').doc();
  const link = inviteLink(invite.id, token);
  const expiresAt = Timestamp.fromMillis(Date.now() + inviteLifetimeMs);
  await invite.create({ workspaceId, invitedEmail, invitedBy: user.uid, tokenHash: createHash('sha256').update(token).digest('hex'), status: 'pending', createdAt: FieldValue.serverTimestamp(), expiresAt });

  try {
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      logger.info('Local workspace invitation', { workspaceId, invitedEmail, link });
    } else {
      const url = smtpUrl.value();
      const from = process.env.INVITE_FROM;
      if (!url || !from) throw new HttpsError('failed-precondition', '초대 메일 SMTP 설정이 없습니다.');
      await nodemailer.createTransport(url).sendMail({
        from,
        to: invitedEmail,
        subject: `${workspace.get('name')} 워크스페이스 초대`,
        text: `${workspace.get('name')} 워크스페이스에 초대되었습니다. 7일 안에 링크를 열고 초대받은 Gmail 주소로 로그인하세요.\n\n${link}`,
      });
    }
  } catch (error) {
    try {
      await invite.update({ status: 'revoked', revokedAt: FieldValue.serverTimestamp() });
    } catch (revokeError) {
      logger.error('Failed to revoke unsent invitation', revokeError);
    }
    if (error instanceof HttpsError) throw error;
    logger.error('Invitation email failed', error);
    throw new HttpsError('internal', '초대 메일을 보내지 못했습니다.');
  }
  try {
    await invite.update({ emailSentAt: FieldValue.serverTimestamp() });
  } catch (error) {
    logger.warn('Invitation delivered without emailSentAt marker', error);
  }
  return process.env.FUNCTIONS_EMULATOR === 'true' ? { inviteId: invite.id, link } : { inviteId: invite.id };
});

export const listInvites = onCall({ region }, async (request) => {
  const user = await verifiedUser(request);
  const workspaceId = field(request.data, 'workspaceId');
  await ownerWorkspace(workspaceId, user.uid);
  const snapshot = await db.collection('workspaceInvites').where('workspaceId', '==', workspaceId).get();
  return { invites: snapshot.docs.map((doc) => ({
    inviteId: doc.id,
    email: doc.get('invitedEmail') as string,
    status: doc.get('status') as string,
    expiresAt: (doc.get('expiresAt') as Timestamp).toDate().toISOString(),
  })) };
});

export const revokeInvite = onCall({ region }, async (request) => {
  const user = await verifiedUser(request);
  const invite = db.doc(`workspaceInvites/${field(request.data, 'inviteId')}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(invite);
    if (!snapshot.exists) throw new HttpsError('not-found', '초대가 없습니다.');
    const workspace = await transaction.get(db.doc(`workspaces/${snapshot.get('workspaceId')}`));
    if (!workspace.exists || workspace.get('ownerId') !== user.uid) throw new HttpsError('permission-denied', '워크스페이스 장만 초대를 철회할 수 있습니다.');
    if (snapshot.get('status') !== 'pending') throw new HttpsError('failed-precondition', '대기 중인 초대만 철회할 수 있습니다.');
    transaction.update(invite, { status: 'revoked', revokedAt: FieldValue.serverTimestamp() });
  });
  return { revoked: true };
});

export const acceptInvite = onCall({ region }, async (request) => {
  const user = await verifiedUser(request);
  const inviteId = field(request.data, 'inviteId');
  const token = field(request.data, 'token');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpsError('invalid-argument', '초대 링크가 올바르지 않습니다.');
  const invite = db.doc(`workspaceInvites/${inviteId}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(invite);
    if (!snapshot.exists || snapshot.get('tokenHash') !== createHash('sha256').update(token).digest('hex')) {
      throw new HttpsError('permission-denied', '초대 링크가 올바르지 않습니다.');
    }
    if (snapshot.get('status') !== 'pending') throw new HttpsError('failed-precondition', '이미 사용하거나 철회한 초대입니다.');
    if ((snapshot.get('expiresAt') as Timestamp).toMillis() <= Date.now()) throw new HttpsError('deadline-exceeded', '만료된 초대입니다.');
    if (snapshot.get('invitedEmail') !== user.email!.toLowerCase()) throw new HttpsError('permission-denied', '초대받은 Gmail 주소로 로그인해 주세요.');
    const workspaceId = snapshot.get('workspaceId') as string;
    const workspace = await transaction.get(db.doc(`workspaces/${workspaceId}`));
    if (!workspace.exists) throw new HttpsError('not-found', '워크스페이스가 없습니다.');
    const member = workspace.ref.collection('members').doc(user.uid);
    if ((await transaction.get(member)).exists) throw new HttpsError('already-exists', '이미 워크스페이스 멤버입니다.');
    transaction.create(member, { uid: user.uid, email: user.email!.toLowerCase(), role: 'member', joinedAt: FieldValue.serverTimestamp() });
    transaction.create(db.doc(`users/${user.uid}/workspaces/${workspaceId}`), { workspaceId, name: workspace.get('name'), role: 'member', joinedAt: FieldValue.serverTimestamp() });
    transaction.update(invite, { status: 'accepted', acceptedBy: user.uid, acceptedAt: FieldValue.serverTimestamp() });
    return { workspaceId };
  });
});
