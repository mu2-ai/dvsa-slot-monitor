FROM mcr.microsoft.com/playwright:v1.42.0-jammy

WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install chromium --with-deps

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
