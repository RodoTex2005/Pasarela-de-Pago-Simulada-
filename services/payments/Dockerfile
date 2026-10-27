
FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY src/ ./src/

EXPOSE 3002

CMD ["npm", "start"]
