# syntax=docker/dockerfile:1

# Etapa 1: compilar la landing (React + Vite) a estaticos.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Interruptor del login global (ver docs/PLAN-LOGIN-GLOBAL.md): con "true" el portal pide sesion y muestra solo las apps de cada
# persona; vacio = portal publico como siempre. Vite lo incrusta al COMPILAR: se pasa como build-arg, no como variable de runtime.
ARG VITE_PORTAL_AUTH=
ENV VITE_PORTAL_AUTH=${VITE_PORTAL_AUTH}
RUN npm run build

# Etapa 2: imagen oficial de nginx. Cualquier archivo en
# /etc/nginx/templates/*.template se procesa con envsubst (reemplaza las
# variables ${...}) y el resultado se escribe en /etc/nginx/conf.d/ al
# arrancar el contenedor -- asi el mismo Dockerfile sirve para local y para
# Coolify, solo cambian las env vars.
FROM nginx:1.27-alpine

COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
