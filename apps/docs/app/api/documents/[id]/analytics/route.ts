const DOCS_API = process.env.DOCS_API_URL ?? 'http://localhost:3102';

export async function GET(
  _request: Request,
  {params}: {params: {id: string}}
) {
  const resp = await fetch(`${DOCS_API}/api/documents/${params.id}/analytics`);
  const data = await resp.json();
  return Response.json(data, {status: resp.status});
}
