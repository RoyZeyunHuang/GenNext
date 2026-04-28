import { GA4TestPlayground } from "./GA4TestPlayground";

export const metadata = {
  title: "GA4 Traffic Test",
};

const GA_ID = "G-0GQNJ281HN";

export default function GA4TestPage() {
  return (
    <>
      {/* Google tag (gtag.js) — SSR-rendered so it shows up in view-source */}
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `,
        }}
      />

      <main
        style={{
          minHeight: "100vh",
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <header
          style={{
            padding: "3rem 1.5rem 1rem",
            textAlign: "center",
            maxWidth: 720,
            margin: "0 auto",
          }}
        >
          <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            GA4 Traffic Test
          </h1>
          <p style={{ opacity: 0.7, lineHeight: 1.6, fontSize: "0.95rem" }}>
            Instrumented with Google Analytics 4 (<code>{GA_ID}</code>). Visit,
            click around, and watch events arrive in the GA4 realtime report.
          </p>
        </header>
        <GA4TestPlayground />
      </main>
    </>
  );
}
