FROM alpine:3.19 AS build

# Install Node.js and npm
RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

FROM alpine:3.19

# Install only Node.js runtime (no npm needed in production)
RUN apk add --no-cache nodejs

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

EXPOSE 3023

CMD ["node", "server.js"]