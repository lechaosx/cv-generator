FROM node:22-alpine as base

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

FROM base as dev

CMD npm start

FROM base as build

RUN npm run build

FROM nginx:alpine as prod

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf