import { defineConfig as composer } from '@prisma/composer/config';
import { nodeBuild } from '@prisma/composer/node/control';
import { prismaCloud, prismaState } from '@prisma/composer-prisma-cloud/control';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  composer: composer({
    extensions: [prismaCloud({ region: 'us-east-1' }), nodeBuild()],
    state: prismaState(),
  }),
});
