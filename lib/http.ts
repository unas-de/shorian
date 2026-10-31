import type {NextRequest} from 'next/server';

function parseOrigin(value:string){
  try{
    const url=new URL(value);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;
    return url.origin;
  }catch{return null}
}

// Proxy headers are not trusted as an authorization boundary. Configure the exact
// external origin when a hosting proxy replaces Host with an internal address.
export function sameOrigin(req:Pick<NextRequest,'headers'>){
  if(req.headers.get('sec-fetch-site')==='cross-site')return false;
  const origin=req.headers.get('origin');
  if(!origin)return true;
  const source=parseOrigin(origin);
  if(!source)return false;
  const configured=process.env.APP_ORIGIN;
  if(configured)return source===parseOrigin(configured);
  return new URL(source).host===req.headers.get('host');
}
