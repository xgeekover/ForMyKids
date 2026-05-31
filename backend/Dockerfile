# ForMyKids 동기화 백엔드 (Express + mysql2)
FROM node:20-alpine
WORKDIR /app

# 의존성만 먼저 설치(레이어 캐시). lockfile 로 재현 가능한 설치.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
