import {searchVideos} from '../../../lib/youtube-api';

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const limit = parseInt(searchParams.get('limit') ?? '20');

  const results = await searchVideos(q, limit);
  return Response.json(results);
}
