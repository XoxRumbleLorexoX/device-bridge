#include <assert.h>
#include <unistd.h>
#include "BridgePeer.h"

int main(void) {
    int peer[2];
    assert(socketpair(AF_UNIX, SOCK_STREAM, 0, peer) == 0);
    assert(BridgeClientConnected(peer[0])); // no data; must not block
    assert(write(peer[1], "x", 1) == 1);
    assert(BridgeClientConnected(peer[0])); // peek must not consume bytes
    char byte;
    assert(read(peer[0], &byte, 1) == 1 && byte == 'x');
    assert(shutdown(peer[1], SHUT_WR) == 0);
    assert(!BridgeClientConnected(peer[0]));
    close(peer[0]); close(peer[1]);
    assert(socketpair(AF_UNIX, SOCK_STREAM, 0, peer) == 0);
    close(peer[1]);
    assert(!BridgeClientConnected(peer[0]));
    close(peer[0]);
    assert(!BridgeClientConnected(-1));
    return 0;
}
