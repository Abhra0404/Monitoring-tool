FROM golang:1.25-alpine AS build

WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /theoria-agent ./cmd/agent

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=build /theoria-agent /usr/local/bin/theoria-agent
ENTRYPOINT ["theoria-agent"]
