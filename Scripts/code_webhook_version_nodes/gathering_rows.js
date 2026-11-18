//  code of Gathering Rows node
return $input.all().map(row => {
  const srvName = row.json.server_id || 'UNKNOWN';
  const srvData = row.json.audit_data || 'No data';

  return {
    json: {
      id: row.json.id,
      server_id: srvName,
      audit_data: srvData,
      combined_audit: `=== ${srvName.toUpperCase()} AUDIT ===\n${srvData}`
    }
  };
});
