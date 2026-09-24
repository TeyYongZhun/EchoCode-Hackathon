export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '96px 16px' }}>
      <h1 style={{ color: '#00f0ff', fontSize: 40, marginBottom: 8 }}>EchoCode</h1>
      <p style={{ fontSize: 20 }}>The voice-first AI pair programmer for VS Code.</p>
      <p style={{ opacity: 0.7 }}>
        This service issues short-lived Gemini Live session tokens for the EchoCode extension. The full landing page
        is on its way.
      </p>
    </main>
  );
}
