FROM postgres:15-alpine

# Modifica QUI: clang19 e llvm19
RUN apk add --no-cache git make gcc musl-dev clang19 llvm19

# RIMOSSO: RUN ln -s ... (non serve più)

# Install pgvector
RUN cd /tmp && \
    git clone --branch v0.7.0 https://github.com/pgvector/pgvector.git && \
    cd pgvector && \
    make && \
    make install && \
    cd .. && \
    rm -rf pgvector