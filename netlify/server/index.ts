import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { kitchens } from '../../db/schema.js';

export const config = { path: '/api/*' };
const cookieName = '__Host-fart-kitchen';

export default async function handler(request: Request) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
  if (new URL(request.url).pathname !== '/api/kitchen') return json({ error: 'Not found' }, 404);
  if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
  if (request.method === 'PUT') {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Invalid origin' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
  }
  const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const id = cookie && /^[a-f0-9-]{36}$/.test(cookie) ? cookie : randomUUID();
  headers.set('Set-Cookie', `${cookieName}=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`);
  try {
    if (request.method === 'GET') {
      const [kitchen] = await db.select({ data: kitchens.data }).from(kitchens).where(eq(kitchens.id, id));
      return json(kitchen?.data ?? {});
    }
    const body = await request.text();
    if (body.length > 1000000) return json({ error: 'Kitchen data is too large' }, 413);
    let data: Record<string, unknown>;
    try { data = JSON.parse(body); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!data || Array.isArray(data) || typeof data !== 'object' || Object.entries(data).some(([key, value]) => !key.startsWith('fart-ai-') || typeof value !== 'string')) {
      return json({ error: 'Invalid kitchen data' }, 400);
    }
    await db.insert(kitchens).values({ id, data: data as Record<string, string> }).onConflictDoUpdate({
      target: kitchens.id,
      set: { data: data as Record<string, string>, updatedAt: new Date() },
    });
    return json({ saved: true });
  } catch {
    return json({ error: 'Your kitchen could not be saved or loaded. Please try again.' }, 503);
  }
}
