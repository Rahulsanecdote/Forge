'use server';

import { redirect } from 'next/navigation';
import { clearPortalSession } from '@/lib/portal/session';

export async function portalLogout() {
  await clearPortalSession();
  redirect('/portal');
}
