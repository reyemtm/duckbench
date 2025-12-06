FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

FROM node:20-slim

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

EXPOSE 3023

CMD ["node", "server.js"]