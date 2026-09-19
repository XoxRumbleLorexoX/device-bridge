"""Local AF_UNIX framing tests, not iOS or network acceptance evidence."""
import json
from pathlib import Path
import socket
import struct
import tempfile
import threading
import time
import unittest
from test_helper import h

class UnixTransportTests(unittest.TestCase):
    def exchange(self, response, claimed_size=None, deadline=None):
        with tempfile.TemporaryDirectory(prefix='br-', dir='/private/tmp') as root:
            path = str(Path(root) / 'ui.sock')
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
                server.bind(path); server.listen(1)
                def peer():
                    with server.accept()[0] as conn:
                        header = conn.recv(4)
                        length = struct.unpack('!I', header)[0]
                        data = b''
                        while len(data) < length: data += conn.recv(length - len(data))
                        self.assertEqual(json.loads(data)['op'], 'observe')
                        reply = json.dumps(response).encode()
                        header = struct.pack('!I', claimed_size or len(reply))
                        for part in [header[:1], header[1:], reply[:2], reply[2:]]:
                            try: conn.sendall(part)
                            except BrokenPipeError: break
                thread = threading.Thread(target=peer)
                thread.start()
                try: return h.UnixUI(path).call({'op': 'observe'}, deadline or time.time() + 2)
                finally: thread.join(timeout=3)
    def test_fragmented_frames(self):
        self.assertEqual(self.exchange({'status': 'ok', 'probe': True})['probe'], True)
    def test_oversized_response_rejected(self):
        with self.assertRaises(h.BridgeError) as caught:
            self.exchange({}, claimed_size=h.UI_LIMIT + 1)
        self.assertEqual(caught.exception.code, 'RECOVERY_REQUIRED')
    def test_native_error_preserved(self):
        with self.assertRaises(h.BridgeError) as caught:
            self.exchange({'error': 'DEVICE_LOCKED'})
        self.assertEqual(caught.exception.code, 'DEVICE_LOCKED')
    def test_missing_socket_recovery_is_not_offline_helper(self):
        with self.assertRaises(h.BridgeError) as caught:
            h.UnixUI('/private/tmp/no-such-device-bridge-socket').call({'op': 'observe'}, time.time() + 1)
        self.assertEqual(caught.exception.code, 'RECOVERY_REQUIRED')
    def test_expired_request_never_connects(self):
        with self.assertRaises(h.BridgeError) as caught:
            h.UnixUI('/private/tmp/no-such-device-bridge-socket').call({'op': 'observe'}, 0)
        self.assertEqual(caught.exception.code, 'DEADLINE_EXCEEDED')
