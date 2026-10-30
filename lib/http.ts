import {NextRequest} from 'next/server';
// Browsers cannot forge Host or Sec-Fetch-Site. Next may normalize nextUrl to 0.0.0.0 behind a proxy.
export function sameOrigin(req:NextRequest){if(req.headers.get('sec-fetch-site')==='cross-site')return false;const origin=req.headers.get('origin');if(!origin)return true;try{const url=new URL(origin);return ['http:','https:'].includes(url.protocol)&&url.host===req.headers.get('host')}catch{return false}}
