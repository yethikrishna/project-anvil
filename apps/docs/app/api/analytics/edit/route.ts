const DOCS_API = process.env.DOCS_API_URL ?? 'http://localhost:3102';

export async function POST(request: Request) {
  const body = await request.json();
  await fetch(`${DOCS_API}/api/analytics/edit`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  return Response.json({success: true});
}
