# ===== ForMyKids 프론트엔드 (정적 MPA) — Multi-stage build =====

# 1) 빌드 스테이지: Node 환경에서 단일 Vite MPA 빌드(dist/ 생성)
FROM node:20-alpine AS build
WORKDIR /app

# 의존성 캐시 최적화: lockfile 먼저 복사 후 설치
# (@playwright/test 는 devDependency 라 npm ci 가 설치하지만, 빌드엔 불필요하고 alpine 에서
#  브라우저 다운로드가 실패/지연될 수 있으므로 다운로드를 건너뛴다 — vite 등 빌드 devDeps 는 그대로 설치)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci

# 소스 복사 후 빌드(런처 + 6개 게임을 한 번에 dist/ 로)
COPY . .
RUN npm run build

# 2) 서빙 스테이지: 가벼운 Nginx(Alpine)에 dist/ 만 올려 정적 호스팅
FROM nginx:alpine AS serve
# MPA 라우팅 + 정적 캐시 최적화 설정
COPY nginx.conf /etc/nginx/conf.d/default.conf
# 빌드 산출물만 복사(소스/노드모듈 없음 → 작고 안전한 이미지)
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
