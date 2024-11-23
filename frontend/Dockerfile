FROM node:22-alpine AS base

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

FROM base AS dev

CMD npm start

FROM base AS build

RUN npm run build

FROM nginx:alpine AS prod

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf