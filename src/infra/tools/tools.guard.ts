import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
}

/**
 * Optional protection for the demo /tools endpoints. If the env var `TOOLS_KEY`
 * is set, every request must present it via `x-tools-key` header or `?key=`.
 * If `TOOLS_KEY` is unset, the endpoints are open (convenient for a local demo).
 */
@Injectable()
export class ToolsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required = process.env.TOOLS_KEY;
    if (!required) return true;
    const req = context.switchToHttp().getRequest<MinimalRequest>();
    const header = req.headers['x-tools-key'];
    const provided = (Array.isArray(header) ? header[0] : header) ?? (req.query.key as string | undefined);
    if (provided === required) return true;
    throw new UnauthorizedException('Invalid or missing tools key');
  }
}
