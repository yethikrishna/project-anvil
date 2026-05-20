/**
 * Next.js API route — Proxy document requests to the Docs backend API.
 * In production, the frontend would call the backend directly.
 * This route proxy allows same-origin API calls during dev.
 */

const DOCS_API = process.env.DOCS_API_URL ?? 'http://localhost:3102';

export async function GET() {
  const resp = await fetch(`${DOCS_API}/api/documents`, {
    headers: {'Content-Type': 'application/json'},
  });
  const data = await resp.json();
  return Response.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const resp = await fetch(`${DOCS_API}/api/documents`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return Response.json(data, {status: resp.status});
}
