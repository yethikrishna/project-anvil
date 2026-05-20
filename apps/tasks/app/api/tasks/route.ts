import {NextResponse} from 'next/server';
import {getAllTasks, createTask, getTask, updateTask, deleteTask} from '../../../lib/tasks';

export async function GET() {
  return NextResponse.json(getAllTasks());
}

export async function POST(request: Request) {
  const body = await request.json();
  const task = createTask(body);
  return NextResponse.json(task, {status: 201});
}
