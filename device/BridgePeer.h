#ifndef DEVICE_BRIDGE_PEER_H
#define DEVICE_BRIDGE_PEER_H
#include <stdbool.h>
#include <errno.h>
#include <sys/socket.h>

// UnixUI does not half-close its write side while waiting for the response.
// EOF means its helper has gone away, not the end of a valid request frame.
static inline bool BridgeClientConnected(int client) {
    char byte;
    ssize_t count = recv(client, &byte, 1, MSG_PEEK | MSG_DONTWAIT);
    return count > 0 || (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK));
}
#endif
