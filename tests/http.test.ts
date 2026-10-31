import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {sameOrigin} from '../lib/http';
const previous=process.env.APP_ORIGIN;
after(()=>{if(previous===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previous});
function request(origin:string|null,host='internal:3000',extra:Record<string,string>={}){return {headers:new Headers({...extra,host,...(origin?{origin}:{})})}}
test('same-host requests work without configured public origin',()=>{delete process.env.APP_ORIGIN;assert.equal(sameOrigin(request('https://clinic.example.com','clinic.example.com')),true);assert.equal(sameOrigin(request('https://evil.example','clinic.example.com')),false)});
test('explicit public origin supports hosting proxies that replace Host',()=>{process.env.APP_ORIGIN='https://clinic.example.com';assert.equal(sameOrigin(request('https://clinic.example.com')),true);assert.equal(sameOrigin(request('https://evil.example')),false);assert.equal(sameOrigin(request('http://clinic.example.com')),false);assert.equal(sameOrigin(request('https://clinic.example.com:444')),false)});
test('forwarded host alone cannot authorize an arbitrary browser origin',()=>{delete process.env.APP_ORIGIN;assert.equal(sameOrigin(request('https://evil.example','internal:3000',{'x-forwarded-host':'evil.example'})),false)});
test('cross-site fetches remain rejected even for an approved origin',()=>{process.env.APP_ORIGIN='https://clinic.example.com';assert.equal(sameOrigin(request('https://clinic.example.com','internal:3000',{'sec-fetch-site':'cross-site'})),false)});
test('invalid origin configuration and malformed Origin fail closed',()=>{for(const config of ['*','null','https://clinic.example.com/path','https://clinic.example.com/?token=x','https://user:pass@clinic.example.com']){process.env.APP_ORIGIN=config;assert.equal(sameOrigin(request('https://clinic.example.com','clinic.example.com')),false)}delete process.env.APP_ORIGIN;for(const origin of ['null','https://clinic.example.com/path','https://clinic.example.com?token=x','ftp://clinic.example.com','https://user:pass@clinic.example.com'])assert.equal(sameOrigin(request(origin,'clinic.example.com')),false)});
test('non-browser requests without Origin keep existing API behavior',()=>{delete process.env.APP_ORIGIN;assert.equal(sameOrigin(request(null)),true)});
