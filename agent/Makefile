# Theoria Agent — cross-compilation targets
#
# Phase 5 of the implementation plan requires the Go agent to ship for five
# platforms. `make build-all` emits statically-linked binaries into `dist/`
# which the release pipeline uploads to GitHub Releases.

BINARY   = theoria-agent
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
DATE    ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)

LDFLAGS = -s -w \
  -X 'main.version=$(VERSION)' \
  -X 'main.commit=$(COMMIT)' \
  -X 'main.buildDate=$(DATE)'

PKG = ./cmd/agent

.PHONY: all build build-all clean test tidy linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 windows-amd64

all: build

build:
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o $(BINARY) $(PKG)

build-all: clean linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 windows-amd64

linux-amd64:
	@mkdir -p dist
	CGO_ENABLED=0 GOOS=linux   GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-linux-amd64       $(PKG)

linux-arm64:
	@mkdir -p dist
	CGO_ENABLED=0 GOOS=linux   GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-linux-arm64       $(PKG)

darwin-amd64:
	@mkdir -p dist
	CGO_ENABLED=0 GOOS=darwin  GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-darwin-amd64      $(PKG)

darwin-arm64:
	@mkdir -p dist
	CGO_ENABLED=0 GOOS=darwin  GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-darwin-arm64      $(PKG)

windows-amd64:
	@mkdir -p dist
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-windows-amd64.exe $(PKG)

checksums: build-all
	cd dist && shasum -a 256 $(BINARY)-* > SHA256SUMS

test:
	go test ./...

tidy:
	go mod tidy

clean:
	rm -rf dist $(BINARY)
