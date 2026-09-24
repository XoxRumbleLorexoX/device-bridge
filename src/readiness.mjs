export const gates = Object.freeze({
  A: { state: 'verified', label: 'baseline_and_architecture', evidence: 'Pinned upstreams, architecture, threat model and capability contract are recorded.' },
  B: { state: 'hardware_required', label: 'local_vertical_slice', evidence: 'Host/simulated verification and the immutable physical-test handoff pass; the observation-resilience candidate still requires owner native build, exact reviewed replacement/activation and real-device acceptance.' },
  C: { state: 'blocked_by_B', label: 'remote_slice', evidence: 'Requires a passed gate B and genuinely separate-network evidence.' },
  D: { state: 'deferred', label: 'fidelity_and_development', evidence: 'Calibration, scoped development/deployment and rollback evidence are intentionally gated.' },
  E: { state: 'partial', label: 'usability_and_hardening', evidence: 'CLI/docs and the physical-test handoff exist; authenticated operator workflow and hardware failure coverage remain gated.' }
});

export function readinessReport() {
  const entries = Object.entries(gates).map(([gate, value]) => ({ gate, ...value }));
  const complete = entries.every(({ state }) => state === 'verified');
  return {
    status: complete ? 'complete' : 'incomplete',
    complete,
    gates: entries,
    next_gate: complete ? null : 'B',
    next_action: complete ? null : 'Use the verified source artifact retained by a successful main CI run. The owner extracts it fresh and runs package-candidate.sh as non-root, returns the exact candidate/review/SHA sidecar, then the host runs prepare_physical_test.py. After exact owner approval/replacement/activation, execute docs/SMOKE.md on the real device and validate gate-b-evidence.json to verdict pass.',
    invariant: 'Host, package or simulated success never upgrades a hardware gate.'
  };
}
