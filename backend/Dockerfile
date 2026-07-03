# Rybaspotting backend — Docker image
# Multi-stage: builder (with Go toolchain) → slim production image

FROM golang:alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /build
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 go build -o /rybaspotting ./cmd/rybaspotting/

# ────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /rybaspotting /usr/local/bin/rybaspotting

EXPOSE 8080

ENTRYPOINT ["rybaspotting"]
