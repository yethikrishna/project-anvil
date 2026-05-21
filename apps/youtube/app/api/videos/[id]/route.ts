import {getVideoDetails, getRelatedVideos} from '../../../../lib/youtube-api';

export async function GET(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const {id} = await params;
  const {searchParams} = new URL(request.url);
  const includeRelated = searchParams.get('related') === 'true';

  const [details, related] = await Promise.all([
    getVideoDetails(id),
    includeRelated ? getRelatedVideos(id) : Promise.resolve([]),
  ]);

  if (!details) {
    return Response.json({error: 'Video not found'}, {status: 404});
  }

  return Response.json({...details, related});
}
