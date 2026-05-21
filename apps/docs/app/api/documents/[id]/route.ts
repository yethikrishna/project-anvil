const DOCS_API = process.env.DOCS_API_URL ?? 'http://localhost:3102';

export async function GET(
  _request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const {id} = await params;
  const resp = await fetch(`${DOCS_API}/api/documents/${id}`);
  const data = await resp.json();
  return Response.json(data, {status: resp.status});
}

export async function PATCH(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const {id} = await params;
  const body = await request.json();
  const resp = await fetch(`${DOCS_API}/api/documents/${id}`, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return Response.json(data);
}

export async function DELETE(
  _request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const {id} = await params;
  const resp = await fetch(`${DOCS_API}/api/documents/${id}`, {
    method: 'DELETE',
  });
  return Response.json({success: true});
}
