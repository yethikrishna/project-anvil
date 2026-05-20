import {NextResponse} from 'next/server';
import {getTask, updateTask, deleteTask} from '../../../../lib/tasks';

export async function GET(_request: Request, {params}: {params: {id: string}}) {
  const task = getTask(params.id);
  return task ? NextResponse.json(task) : NextResponse.json({error: 'Not found'}, {status: 404});
}

export async function PATCH(request: Request, {params}: {params: {id: string}}) {
  const body = await request.json();
  const task = updateTask(params.id, body);
  return task ? NextResponse.json(task) : NextResponse.json({error: 'Not found'}, {status: 404});
}

export async function DELETE(_request: Request, {params}: {params: {id: string}}) {
  const ok = deleteTask(params.id);
  return ok ? NextResponse.json({success: true}) : NextResponse.json({error: 'Not found'}, {status: 404});
}
