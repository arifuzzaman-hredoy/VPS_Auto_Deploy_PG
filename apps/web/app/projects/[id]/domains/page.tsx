const records = [
  ['Main domain', 'A', '@', '198.54.121.88'],
  ['Subdomain', 'CNAME', 'school', 'cname.deploy.techteamlead.com'],
  ['Wildcard', 'CNAME', '*.mess', 'cname.deploy.techteamlead.com'],
  ['Ownership', 'TXT', '_deployos.school', 'deployos-verify=project_xxxxx']
];

export default function DomainsPage() {
  return (
    <div className="shell">
      <aside className="sidebar"><div className="logo"><span className="logo-mark" /> TechTeam Deploy OS</div></aside>
      <main className="main">
        <div className="title" style={{ marginBottom: 18 }}>
          <h1>Domain Manager</h1>
          <p>Main domain, subdomain, wildcard, DNS provider API, duplicate check, TXT ownership and SSL.</p>
        </div>
        <div className="grid grid-2">
          <div className="card">
            <h2>Add Domain</h2>
            <select className="input"><option>Popular provider API</option><option>Custom provider API</option><option>Managed nameserver</option></select>
            <div style={{ height: 10 }} />
            <select className="input"><option>Main domain</option><option>Subdomain</option><option>Wildcard subdomain</option><option>SaaS tenant wildcard</option></select>
            <div style={{ height: 10 }} />
            <input className="input" placeholder="example.com / school.example.com / *.mess.example.com" />
            <div style={{ height: 10 }} />
            <button className="btn">Check Domain</button>
          </div>
          <div className="card">
            <h2>Status</h2>
            <p><span className="badge">Format Valid</span> <span className="badge">Available</span> <span className="badge warn">DNS Pending</span></p>
            <div style={{ height: 12 }} />
            <pre className="code">Duplicate check → DNS record preview → API dry-run → TXT ownership → SSL → LIVE</pre>
          </div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <h2>DNS Record Plan</h2>
          <table className="table"><thead><tr><th>Use</th><th>Type</th><th>Name</th><th>Value</th></tr></thead><tbody>{records.map((row) => <tr key={row.join('-')}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table>
        </div>
      </main>
    </div>
  );
}
