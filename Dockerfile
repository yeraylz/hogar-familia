# --- Etapa de compilación ---
FROM golang:1.27.1-alpine AS build
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
# CGO_ENABLED=0: no hace falta, ya usamos modernc.org/sqlite (SQLite en Go puro).
RUN CGO_ENABLED=0 GOOS=linux go build -o hogar .

# --- Imagen final, ligera ---
FROM alpine:3.20
WORKDIR /app

COPY --from=build /app/hogar .
COPY --from=build /app/web ./web

EXPOSE 8080
CMD ["./hogar"]
