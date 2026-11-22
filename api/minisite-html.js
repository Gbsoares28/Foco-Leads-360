import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const backend = 'https://foco-leads-360.ai.studio';

export default async function handler(req, res) {
  const { slug, preview } = req.query;
  let indexable = false;
  let status = 200;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  try {
    if (preview !== '1' && typeof slug === 'string' && /^[a-z0-9-]{3,64}$/.test(slug)) {
      const response = await fetch(
        new URL('/api/public/site/' + encodeURIComponent(slug) + '?prefetch=1', backend),
        { signal: AbortSignal.timeout(5000) }
      );
      if (response.status === 404) {
        status = 404;
      } else if (response.ok) {
        const data = await response.json();
        indexable = data.minisite?.mediaValidated === true && data.minisite.slug === slug;
      }
    }
  } catch {
    // Preserve access to the frontend when the backend is temporarily unavailable.
  }
  try {
    const shell = await readFile(join(process.cwd(), 'dist/index.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (indexable) res.removeHeader('X-Robots-Tag');
    return res.status(status).send(shell);
  } catch {
    return res.status(503).end();
  }
}
