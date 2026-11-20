# syntax=docker/dockerfile:1
#
# Servicio de login global del portal (portal-auth). Coolify: Build Pack Dockerfile, Base Directory /auth, puerto 3060.
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:20-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production \
    PORT=3060

EXPOSE 3060
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `npm start` encadena migrate + arranque; los datos iniciales (catalogo de apps) van en migraciones.
CMD ["npm", "start"]
