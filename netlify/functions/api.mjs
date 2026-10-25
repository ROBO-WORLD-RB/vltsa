import serverless from 'serverless-http';
import { createApp } from '../../server.mjs';

const app = createApp();
const wrapped = serverless(app, { binary: ['image/*', 'application/octet-stream'] });
export const handler = (event, context) => {
  const suffix=(event.path||'').replace(/^\/\.netlify\/functions\/api/, '');
  return wrapped({...event,path:suffix.startsWith('/api/')?suffix:'/api'+suffix},context);
};
