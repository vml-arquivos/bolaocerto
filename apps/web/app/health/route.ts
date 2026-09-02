export function GET() {
  return Response.json({ status: 'ok', service: 'bl-web', timestamp: new Date().toISOString() });
}
