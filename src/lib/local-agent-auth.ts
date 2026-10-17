import { timingSafeEqual } from 'crypto';
export function localAgentAuthorized(request:Request):boolean {
 const token=process.env.AGENT_TOKEN;
 const provided=request.headers.get('x-agent-token');
 if(!token || !provided)return false;
 const a=Buffer.from(token),b=Buffer.from(provided);
 return a.length===b.length && timingSafeEqual(a,b);
}
