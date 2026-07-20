import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'forge_admin';
const TOKEN_VERSION = 'v1';

function getAdminPassword() {
  return process.env.FORGE_ADMIN_PASSWORD;
}

function createToken(password: string) {
  return `${TOKEN_VERSION}.${createHmac('sha256', password)
    .update('forge-admin-session')
    .digest('hex')}`;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAdminConfigured() {
  return Boolean(getAdminPassword());
}

export async function isAdminAuthenticated() {
  const password = getAdminPassword();
  if (!password) return false;

  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return Boolean(token && safeEqual(token, createToken(password)));
}

export async function setAdminSession() {
  const password = getAdminPassword();
  if (!password) throw new Error('FORGE_ADMIN_PASSWORD is not configured.');

  (await cookies()).set(COOKIE_NAME, createToken(password), {
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    path: '/dashboard',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(COOKIE_NAME);
}

export function verifyAdminPassword(input: string) {
  const password = getAdminPassword();
  return Boolean(password && input && safeEqual(input, password));
}
