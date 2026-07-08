const providers = ['Cloudflare', 'Namecheap', 'GoDaddy', 'DigitalOcean DNS', 'AWS Route53', 'Hostinger', 'cPanel/WHM', 'Porkbun', 'Custom Provider'];

export default function DnsProvidersPage() {
  return (
    <div className="shell">
      <aside className="sidebar"><div className="logo"><span className="logo-mark" /> TechTeam Deploy OS</div></aside>
      <main className="main">
        <div className="title" style={{ marginBottom: 18 }}>
          <h1>DNS Providers</h1>
          <p>Popular provider API + custom provider adapter with test connection and dry-run.</p>
        </div>
        <div className="grid grid-3">
          {providers.map((provider) => <div className="card" key={provider}><h3>{provider}</h3><p>API credential encrypted. DNS write requires preview confirmation.</p></div>)}
        </div>
      </main>
    </div>
  );
}
