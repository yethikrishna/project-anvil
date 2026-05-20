const DOCS_API = process.env.DOCS_API_URL ?? 'http://localhost:3102';

export async function GET() {
  const resp = await fetch(`${DOCS_API}/api/analytics/global`);
  const data = await resp.json();
  return Response.json(data);
}
