FROM node:22-alpine

WORKDIR /app

# Primero las dependencias, para aprovechar la caché de Docker
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
