import type { ServerResponse } from 'node:http';

/** JSON response helper shared by the loopback server routes. */
export function json(res: ServerResponse, status: number, payload: unknown, head = false): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(head ? undefined : JSON.stringify(payload));
}
