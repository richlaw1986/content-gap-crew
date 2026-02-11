import { NextRequest } from 'next/server';

/**
 * Catch-all proxy route that forwards requests to the FastAPI backend.
 * 
 * This keeps all API calls on the same origin as the frontend, which:
 * - Avoids CORS issues
 * - Allows cookies to flow naturally for auth
 * - Simplifies client-side code (no need to handle different origins)
 */

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

async function proxyRequest(request: NextRequest, path: string[]) {
  // The catch-all receives path segments after /api/
  // FastAPI has /health at root, but /api/* for other routes
  // So /api/health -> /health, /api/runs -> /api/runs
  const pathStr = path.join('/');
  const targetPath = pathStr === 'health' ? '/health' : `/api/${pathStr}`;
  const targetUrl = new URL(targetPath, FASTAPI_URL);
  
  // Forward query params
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  // Build headers, forwarding relevant ones
  const headers = new Headers();
  const forwardHeaders = ['content-type', 'authorization', 'cookie', 'accept'];
  
  forwardHeaders.forEach(header => {
    const value = request.headers.get(header);
    if (value) headers.set(header, value);
  });

  // Check if this is an SSE request
  const acceptHeader = request.headers.get('accept') || '';
  const isSSE = acceptHeader.includes('text/event-stream');

  try {
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' 
        ? await request.text() 
        : undefined,
      // Don't buffer SSE responses
      // @ts-expect-error - duplex is needed for streaming but not in types
      duplex: 'half',
    });

    // For SSE, we need to stream the response
    if (isSSE && response.body) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // For regular responses, forward as-is
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Skip hop-by-hop headers
      if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Proxy error forwarding ${request.method} ${targetUrl.toString()}: ${msg}`);
    return new Response(
      JSON.stringify({ 
        error: 'Backend unavailable',
        detail: `Could not reach FastAPI at ${FASTAPI_URL}. Is the backend running?`,
        message: msg,
      }),
      { 
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}
