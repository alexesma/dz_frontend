# Stage 1: build
FROM node:20-alpine AS build

# Установите рабочую директорию
WORKDIR /app

# Копируйте package.json и package-lock.json для кеширования зависимостей
COPY package*.json ./

# Установите все зависимости (включая dev для сборки)
RUN npm install

# Копируйте исходный код
COPY . .

# Установите переменную окружения для API
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

# Соберите приложение для продакшена (Vite создает папку dist)
RUN npm run build

# Stage 2: production image
FROM nginx:alpine

# Установите curl для healthcheck
RUN apk add --no-cache curl

# Удалите стандартную конфигурацию nginx
RUN rm /etc/nginx/conf.d/default.conf

# Копируйте собранное приложение из build stage (dist для Vite)
COPY --from=build /app/dist /usr/share/nginx/html

# Копируйте кастомную конфигурацию nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Экспонируйте порт 80
EXPOSE 80

# Healthcheck для контейнера
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
