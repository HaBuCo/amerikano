FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY server ./server
COPY src/game ./src/game
COPY src/network/types.ts ./src/network/types.ts
ENV PORT=8090
ENV ROOM_DB=/data/rooms.sqlite
EXPOSE 8090
CMD ["npm", "run", "server"]
