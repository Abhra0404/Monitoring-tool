FROM node:20-alpine AS client-build

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN REACT_APP_API_URL="" npm run build

FROM node:20-alpine

WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
COPY --from=client-build /app/client/build ./client/build

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "server/src/index.js"]
