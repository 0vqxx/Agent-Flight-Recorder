import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const traceId = searchParams.get('trace_id');

  // Check persistent flight store
  const localFilePath = path.resolve(process.cwd(), '..', '.afr', 'traces.json');
  
  try {
    if (fs.existsSync(localFilePath)) {
      const fileData = fs.readFileSync(localFilePath, 'utf8');
      const traces = JSON.parse(fileData);
      
      if (traceId) {
        const matched = traces.find((t: any) => t.id === traceId);
        if (matched) {
          return NextResponse.json({
            trace: matched,
            spans: matched.spans || [],
          });
        }
      }
      
      return NextResponse.json({
        items: traces,
        total: traces.length,
      });
    }
  } catch (e) {
    console.error('Error reading local traces:', e);
  }

  return NextResponse.json({ items: [], total: 0, spans: [] });
}
