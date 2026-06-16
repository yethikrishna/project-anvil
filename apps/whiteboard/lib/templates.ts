/**
 * Whiteboard templates — pre-seeded elements for common use cases.
 */

export type TemplateType = 'blank' | 'wireframe' | 'mindmap' | 'flowchart' | 'retro';

export interface Template {
  id: TemplateType;
  label: string;
  description: string;
  emoji: string;
  /** Excalidraw elements as JSON */
  elements: object[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    label: 'Blank Canvas',
    description: 'Start from scratch',
    emoji: '⬜',
    elements: [],
  },
  {
    id: 'wireframe',
    label: 'Wireframe',
    description: 'UI wireframe kit with common components',
    emoji: '🖼️',
    elements: [
      // Browser chrome mockup
      {
        type: 'rectangle', id: 'wire-1', x: 100, y: 80, width: 800, height: 500,
        angle: 0, strokeColor: '#6b7280', backgroundColor: '#f9fafb',
        fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100,
        groupIds: ['browser'], roundness: { type: 3, value: 8 },
      },
      // Title bar
      {
        type: 'rectangle', id: 'wire-2', x: 100, y: 80, width: 800, height: 44,
        angle: 0, strokeColor: '#6b7280', backgroundColor: '#e5e7eb',
        fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100,
        groupIds: ['browser'], roundness: { type: 3, value: 8 },
      },
      // Nav bar item
      {
        type: 'rectangle', id: 'wire-nav', x: 120, y: 140, width: 760, height: 40,
        angle: 0, strokeColor: '#9ca3af', backgroundColor: '#ffffff',
        fillStyle: 'solid', strokeWidth: 1, roughness: 0, opacity: 100,
      },
      // Content area boxes
      {
        type: 'rectangle', id: 'wire-sidebar', x: 120, y: 200, width: 180, height: 360,
        angle: 0, strokeColor: '#9ca3af', backgroundColor: '#f3f4f6',
        fillStyle: 'solid', strokeWidth: 1, roughness: 0, opacity: 100,
      },
      {
        type: 'rectangle', id: 'wire-main', x: 320, y: 200, width: 560, height: 360,
        angle: 0, strokeColor: '#9ca3af', backgroundColor: '#ffffff',
        fillStyle: 'solid', strokeWidth: 1, roughness: 0, opacity: 100,
      },
    ],
  },
  {
    id: 'mindmap',
    label: 'Mind Map',
    description: 'Central topic with branching ideas',
    emoji: '🧠',
    elements: [
      // Central node
      {
        type: 'ellipse', id: 'mm-center', x: 400, y: 240, width: 200, height: 80,
        angle: 0, strokeColor: '#3b82f6', backgroundColor: '#dbeafe',
        fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100,
      },
      {
        type: 'text', id: 'mm-center-text', x: 440, y: 265, text: 'Main Idea',
        fontSize: 20, fontFamily: 1, textAlign: 'center',
        strokeColor: '#1e40af', opacity: 100,
      },
      // Branch 1
      {
        type: 'ellipse', id: 'mm-b1', x: 120, y: 100, width: 140, height: 60,
        angle: 0, strokeColor: '#10b981', backgroundColor: '#d1fae5',
        fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100,
      },
      {
        type: 'text', id: 'mm-b1-text', x: 145, y: 120, text: 'Idea 1',
        fontSize: 16, fontFamily: 1, textAlign: 'center',
        strokeColor: '#065f46', opacity: 100,
      },
      {
        type: 'arrow', id: 'mm-a1', x: 260, y: 285, points: [[0, 0], [-140, -155]],
        angle: 0, strokeColor: '#6b7280', strokeWidth: 2, roughness: 0, opacity: 100,
        startBinding: { elementId: 'mm-center', focus: 0, gap: 8 },
        endBinding: { elementId: 'mm-b1', focus: 0, gap: 8 },
      },
    ],
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    description: 'Decision flow with start/end nodes',
    emoji: '📊',
    elements: [
      // Start
      {
        type: 'ellipse', id: 'fc-start', x: 350, y: 60, width: 100, height: 50,
        angle: 0, strokeColor: '#374151', backgroundColor: '#6b7280',
        fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100,
      },
      {
        type: 'text', id: 'fc-start-text', x: 376, y: 77, text: 'Start',
        fontSize: 16, fontFamily: 1, textAlign: 'center',
        strokeColor: '#ffffff', opacity: 100,
      },
      // Process
      {
        type: 'rectangle', id: 'fc-proc', x: 330, y: 160, width: 140, height: 60,
        angle: 0, strokeColor: '#2563eb', backgroundColor: '#bfdbfe',
        fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100,
      },
      {
        type: 'text', id: 'fc-proc-text', x: 347, y: 182, text: 'Process',
        fontSize: 16, fontFamily: 1, textAlign: 'center',
        strokeColor: '#1e3a8a', opacity: 100,
      },
      // Decision diamond
      {
        type: 'diamond', id: 'fc-decision', x: 330, y: 280, width: 140, height: 80,
        angle: 0, strokeColor: '#d97706', backgroundColor: '#fef3c7',
        fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100,
      },
      {
        type: 'text', id: 'fc-dec-text', x: 344, y: 310, text: 'Decision?',
        fontSize: 14, fontFamily: 1, textAlign: 'center',
        strokeColor: '#92400e', opacity: 100,
      },
      // End
      {
        type: 'ellipse', id: 'fc-end', x: 350, y: 430, width: 100, height: 50,
        angle: 0, strokeColor: '#374151', backgroundColor: '#6b7280',
        fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100,
      },
      {
        type: 'text', id: 'fc-end-text', x: 377, y: 448, text: 'End',
        fontSize: 16, fontFamily: 1, textAlign: 'center',
        strokeColor: '#ffffff', opacity: 100,
      },
      // Arrows
      {
        type: 'arrow', id: 'fc-arr1', x: 400, y: 110, points: [[0, 0], [0, 50]],
        angle: 0, strokeColor: '#374151', strokeWidth: 2, roughness: 0, opacity: 100,
      },
      {
        type: 'arrow', id: 'fc-arr2', x: 400, y: 220, points: [[0, 0], [0, 60]],
        angle: 0, strokeColor: '#374151', strokeWidth: 2, roughness: 0, opacity: 100,
      },
      {
        type: 'arrow', id: 'fc-arr3', x: 400, y: 360, points: [[0, 0], [0, 70]],
        angle: 0, strokeColor: '#374151', strokeWidth: 2, roughness: 0, opacity: 100,
      },
    ],
  },
  {
    id: 'retro',
    label: 'Retrospective',
    description: 'What went well, what to improve, action items',
    emoji: '🔄',
    elements: [
      // Column 1: Went well
      {
        type: 'rectangle', id: 'retro-c1', x: 60, y: 100, width: 220, height: 400,
        angle: 0, strokeColor: '#16a34a', backgroundColor: '#f0fdf4',
        fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100,
      },
      {
        type: 'text', id: 'retro-h1', x: 95, y: 120, text: '✅ Went Well',
        fontSize: 18, fontFamily: 1, textAlign: 'left',
        strokeColor: '#15803d', opacity: 100,
      },
      // Column 2: Improve
      {
        type: 'rectangle', id: 'retro-c2', x: 310, y: 100, width: 220, height: 400,
        angle: 0, strokeColor: '#dc2626', backgroundColor: '#fef2f2',
        fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100,
      },
      {
        type: 'text', id: 'retro-h2', x: 330, y: 120, text: '🔧 To Improve',
        fontSize: 18, fontFamily: 1, textAlign: 'left',
        strokeColor: '#b91c1c', opacity: 100,
      },
      // Column 3: Action items
      {
        type: 'rectangle', id: 'retro-c3', x: 560, y: 100, width: 220, height: 400,
        angle: 0, strokeColor: '#2563eb', backgroundColor: '#eff6ff',
        fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100,
      },
      {
        type: 'text', id: 'retro-h3', x: 580, y: 120, text: '🎯 Action Items',
        fontSize: 18, fontFamily: 1, textAlign: 'left',
        strokeColor: '#1d4ed8', opacity: 100,
      },
    ],
  },
];

export function getTemplate(id: TemplateType): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
