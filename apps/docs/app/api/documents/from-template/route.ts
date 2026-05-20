const DOCS_API = process.env.DOCS_API_URL ?? 'http://localhost:3102';

export async function POST(request: Request) {
  const body = await request.json();
  const resp = await fetch(`${DOCS_API}/api/documents/from-template`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return Response.json(data, {status: resp.status});
}
