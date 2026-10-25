import { module } from '@prisma/composer';
import { compute } from '@prisma/composer-prisma-cloud';
import { node } from '@prisma/composer/node';

const web = compute({
  name: 'web',
  build: node({ module: import.meta.url, entry: './server.mjs' }),
});

export default module('vlts', ({ provision }) => {
  provision(web);
});
