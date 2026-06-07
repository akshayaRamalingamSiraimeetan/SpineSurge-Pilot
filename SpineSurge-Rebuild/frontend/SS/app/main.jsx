/* SpineSurge Pro — root app */
function Stub({ name }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>
      <div style={{ textAlign: 'center' }}>
        <Icon name="sparkle" size={30} />
        <div style={{ marginTop: 10, fontWeight: 600 }}>{name} — coming up next</div>
      </div>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useThemeState();
  const [route, setRoute] = useState('dashboard');
  const [settings, setSettings] = useState(false);

  function go(r) { setRoute(r); }

  let screen;
  if (route === 'dashboard') screen = <Dashboard go={go} />;
  else if (route === 'workspace') screen = window.Workspace ? <Workspace go={go} /> : <Stub name="Workspace" />;
  else if (route === 'patients') screen = window.PatientsScreen ? <PatientsScreen go={go} /> : <Stub name="Patients" />;
  else if (route === 'library') screen = window.LibraryScreen ? <LibraryScreen go={go} /> : <Stub name="Library" />;

  return (
    <div className="app">
      <Sidebar route={route} go={go} onSettings={() => setSettings(true)} theme={theme} setTheme={setTheme} />
      <div className="app-main">{screen}</div>
      {settings && window.SettingsModal && <SettingsModal onClose={() => setSettings(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
