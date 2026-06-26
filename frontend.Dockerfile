FROM node:20-alpine AS builder

WORKDIR /app

ARG EXPO_PUBLIC_API_URL=https://api.visionaryx.forgetechno.com
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npx expo export --platform web

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
