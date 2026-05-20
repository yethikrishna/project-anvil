import {getVideoDetails, getRelatedVideos} from '../../../../lib/youtube-api';

export async function GET(
  request: Request,
  {params}: {params: {id: string}}
) {
  const {searchParams} = new URL(request.url);
  const includeRelated = searchParams.get('related') === 'true';

  const [details, related] = await Promise.all([
    getVideoDetails(params.id),
    includeRelated ? getRelatedVideos(params.id) : Promise.resolve([]),
  ]);

  if (!details) {
    return Response.json({error: 'Video not found'}, {status: 404});
  }

  return Response.json({...details, related});
}
