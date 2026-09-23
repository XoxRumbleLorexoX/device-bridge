export const gates = Object.freeze({
  A: { state: 'verified', label: 'baseline_and_architecture', evidence: 'Pinned upstreams, architecture, threat model and capability contract are recorded.' },
  B: { state: 'hardware_required', label: 'local_vertical_slice', evidence: 'Host/simulated verification passes; the reviewed observation-resilience candidate has a deterministic source/package-review path but still requires owner native build, approved install/activation and real-device acceptance.' },
  C: { state: 'blocked_by_B', label: 'remote_slice', evidence: 'Requires a passed gate B and genuinely separate-network evidence.' },
  D: { state: 'deferred', label: 'fidelity_and_development', evidence: 'Calibration, scoped development/deployment and rollback evidence are intentionally gated.' },
  E: { state: 'partial', label: 'usability_and_hardening', evidence: 'CLI/docs exist; authenticated operator workflow and hardware failure coverage remain gated.' }
});

export function readinessReport() {
  const entries = Object.entries(gates).map(([gate, value]) => ({ gate, ...value }));
  const complete = entries.every(({ state }) => state === 'verified');
  return {
    status: complete ? 'complete' : 'incomplete',
    complete,
    gates: entries,
    next_gate: complete ? null : 'B',
    next_action: complete ? null : 'Create the deterministic 0.1.1 source bundle, have the owner run its non-root package-candidate.sh native build/review, generate the hash-bound replacement, obtain specific deployment/activation approval, then run the documented real-device gate-B acceptance sequence.',
    invariant: 'Host, package or simulated success never upgrades a hardware gate.'
  };
}
