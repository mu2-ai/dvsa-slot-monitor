FROM mcr.microsoft.com/playwright:v1.42.0-jammy

WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install chromium --with-deps

COPY . .

EXPOSE 8080

CMD ["node", "server.js"]
