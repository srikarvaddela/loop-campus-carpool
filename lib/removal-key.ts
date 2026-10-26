// Legacy removals predate the dedicated column. They retain their original resolved report as the event key.
// The SQL fragment is static; all request values are still bound separately.
export const removalKeySql =
  "COALESCE(r.removal_report_id,(SELECT p.id FROM reports p WHERE p.ride_id=r.id AND p.status='resolved' AND p.resolution='hide' ORDER BY p.resolved_at DESC,p.id DESC LIMIT 1))";
