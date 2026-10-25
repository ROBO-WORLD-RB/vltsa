FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/storage/orders.sqlite
VOLUME ["/app/storage"]
EXPOSE 3000
CMD ["node", "server.mjs"]
