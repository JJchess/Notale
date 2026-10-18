FROM docker:28.5.1-dind
RUN addgroup -g 1000 -S notale
# Compose passes an explicit dockerd command with one Unix listener. The official
# entrypoint's implicit TCP listener is therefore never added.
