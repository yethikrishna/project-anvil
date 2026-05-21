const DOCS_API = process.env.DOCS_API_URL ?? 'http://localhost:3102';

export async function GET(
  _request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const {id} = await params;
  const resp = await fetch(`${DOCS_API}/api/documents/${id}/export/pdf`);

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({error: 'Export failed'}));
    return Response.json(data, {status: resp.status});
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  const disposition = resp.headers.get('content-disposition') ?? 'attachment; filename="document.pdf"';

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
      'Content-Length': String(buffer.length),
    },
  });
}
