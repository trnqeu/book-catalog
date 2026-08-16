FROM postgres:15-alpine

# clang/llvm version must match the toolchain postgres:15-alpine was built
# with (see /usr/local/lib/postgresql/pgxs/src/Makefile.global -> CLANG),
# otherwise pgvector's bitcode build fails with "clang-XX: No such file".
RUN apk add --no-cache git make gcc musl-dev clang21 llvm21

# Install pgvector
RUN cd /tmp && \
    git clone --branch v0.7.0 https://github.com/pgvector/pgvector.git && \
    cd pgvector && \
    make && \
    make install && \
    cd .. && \
    rm -rf pgvector