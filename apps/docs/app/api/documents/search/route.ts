const DOCS_API = process.env.DOCS_API_URL ?? 'http://localhost:3102';

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const resp = await fetch(`${DOCS_API}/api/documents/search?q=${encodeURIComponent(q)}`);
  const data = await resp.json();
  return Response.json(data);
}
