"use client";

import { useState, type CSSProperties } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function track(event: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") {
    window.gtag("event", event, params);
  }
  // eslint-disable-next-line no-console
  console.log("[GA4] event", event, params);
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function GA4TestPlayground() {
  const [tab, setTab] = useState<TabId>("overview");
  const [formStarted, setFormStarted] = useState(false);
  const [submitted, setSubmitted] = useState<null | string>(null);
  const [searchValue, setSearchValue] = useState("");
  const [eventLog, setEventLog] = useState<string[]>([]);

  function logAndTrack(event: string, params: Record<string, unknown> = {}) {
    track(event, params);
    setEventLog((prev) =>
      [
        `${new Date().toLocaleTimeString()}  ${event}  ${JSON.stringify(params)}`,
        ...prev,
      ].slice(0, 12)
    );
  }

  function handleTabChange(next: TabId) {
    if (next === tab) return;
    setTab(next);
    logAndTrack("tab_select", { tab_name: next });
  }

  function handleFormFocus() {
    if (formStarted) return;
    setFormStarted(true);
    logAndTrack("form_start", { form_name: "signup" });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") || "");
    const email = String(data.get("email") || "");
    const plan = String(data.get("plan") || "");
    logAndTrack("form_submit", {
      form_name: "signup",
      plan,
      has_name: !!name,
      has_email: !!email,
    });
    logAndTrack("generate_lead", { plan });
    setSubmitted(email || name || "anonymous");
    e.currentTarget.reset();
    setFormStarted(false);
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!searchValue.trim()) return;
    logAndTrack("search", { search_term: searchValue.trim() });
    setSearchValue("");
  }

  return (
    <section style={styles.section}>
      {/* Tabs */}
      <div>
        <h2 style={styles.h2}>Tabs</h2>
        <div style={styles.tabRow}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              style={{
                ...styles.tabBtn,
                ...(tab === t.id ? styles.tabBtnActive : null),
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={styles.tabPanel}>
          {tab === "overview" && (
            <p>
              Welcome. This is the overview tab. Switching tabs fires{" "}
              <code>tab_select</code>.
            </p>
          )}
          {tab === "pricing" && (
            <p>Pricing details would live here. Try the signup form below.</p>
          )}
          {tab === "faq" && (
            <p>Frequently asked questions. Use the search box to fire a query.</p>
          )}
        </div>
      </div>

      {/* Search */}
      <div>
        <h2 style={styles.h2}>Search</h2>
        <form onSubmit={handleSearch} style={styles.searchRow}>
          <input
            type="search"
            placeholder="Type a query and press enter…"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            style={styles.input}
          />
          <button type="submit" style={styles.primaryBtn}>
            Search
          </button>
        </form>
      </div>

      {/* Signup form */}
      <div>
        <h2 style={styles.h2}>Signup form</h2>
        <form onSubmit={handleSubmit} onFocus={handleFormFocus} style={styles.form}>
          <label style={styles.field}>
            <span style={styles.label}>Name</span>
            <input name="name" type="text" required style={styles.input} />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>Email</span>
            <input name="email" type="email" required style={styles.input} />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>Plan</span>
            <select name="plan" defaultValue="free" style={styles.input}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
            </select>
          </label>
          <button type="submit" style={styles.primaryBtn}>
            Submit
          </button>
          {submitted && (
            <p style={styles.success}>
              Submitted as <strong>{submitted}</strong>. Fired{" "}
              <code>form_submit</code> + <code>generate_lead</code>.
            </p>
          )}
        </form>
      </div>

      {/* Misc events */}
      <div>
        <h2 style={styles.h2}>Other events</h2>
        <div style={styles.btnRow}>
          <button
            type="button"
            style={styles.secondaryBtn}
            onClick={() =>
              logAndTrack("select_content", {
                content_type: "button",
                item_id: "cta_primary",
              })
            }
          >
            Fire select_content
          </button>
          <button
            type="button"
            style={styles.secondaryBtn}
            onClick={() =>
              logAndTrack("share", {
                method: "copy_link",
                content_type: "page",
              })
            }
          >
            Fire share
          </button>
          <a
            href="https://www.google.com"
            target="_blank"
            rel="noreferrer noopener"
            style={styles.secondaryBtn}
            onClick={() =>
              logAndTrack("click", {
                link_url: "https://www.google.com",
                outbound: true,
              })
            }
          >
            Outbound link →
          </a>
          <a
            href="data:text/plain;charset=utf-8,GA4%20test%20file"
            download="ga4-test.txt"
            style={styles.secondaryBtn}
            onClick={() =>
              logAndTrack("file_download", {
                file_name: "ga4-test.txt",
                file_extension: "txt",
              })
            }
          >
            Download file
          </a>
        </div>
      </div>

      {/* Event log */}
      <div>
        <h2 style={styles.h2}>Event log (this session)</h2>
        <pre style={styles.log}>
          {eventLog.length === 0
            ? "No events yet. Click around above."
            : eventLog.join("\n")}
        </pre>
        <p style={styles.hint}>
          Note: <code>page_view</code> and <code>scroll</code> are sent
          automatically by gtag and will not show in this log.
        </p>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "2rem",
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",
    padding: "2rem 1.5rem 4rem",
  },
  h2: {
    fontSize: "1rem",
    fontWeight: 600,
    margin: "0 0 0.75rem",
    opacity: 0.9,
    letterSpacing: "0.02em",
  },
  tabRow: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  tabBtn: {
    background: "transparent",
    color: "#fafafa",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#2a2a2a",
    padding: "0.5rem 1rem",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  tabBtnActive: {
    background: "#fafafa",
    color: "#0a0a0a",
    borderColor: "#fafafa",
  },
  tabPanel: {
    marginTop: "0.75rem",
    padding: "1rem",
    border: "1px solid #1f1f1f",
    borderRadius: 8,
    background: "#111",
    fontSize: "0.9rem",
    lineHeight: 1.6,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    padding: "1rem",
    border: "1px solid #1f1f1f",
    borderRadius: 8,
    background: "#111",
  },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: "0.8rem", opacity: 0.7 },
  input: {
    background: "#0a0a0a",
    color: "#fafafa",
    border: "1px solid #2a2a2a",
    padding: "0.5rem 0.75rem",
    borderRadius: 6,
    fontSize: "0.9rem",
    fontFamily: "inherit",
  },
  primaryBtn: {
    background: "#fafafa",
    color: "#0a0a0a",
    border: "none",
    padding: "0.55rem 1rem",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
    alignSelf: "flex-start",
    fontSize: "0.9rem",
  },
  secondaryBtn: {
    background: "#111",
    color: "#fafafa",
    border: "1px solid #2a2a2a",
    padding: "0.5rem 0.9rem",
    borderRadius: 6,
    cursor: "pointer",
    textDecoration: "none",
    fontSize: "0.875rem",
    fontFamily: "inherit",
    display: "inline-block",
  },
  btnRow: { display: "flex", gap: "0.5rem", flexWrap: "wrap" },
  searchRow: { display: "flex", gap: "0.5rem" },
  success: {
    fontSize: "0.85rem",
    color: "#7ee787",
    margin: 0,
  },
  log: {
    background: "#0a0a0a",
    border: "1px solid #1f1f1f",
    borderRadius: 8,
    padding: "0.75rem",
    fontSize: "0.75rem",
    lineHeight: 1.5,
    minHeight: 80,
    whiteSpace: "pre-wrap",
    margin: 0,
    color: "#cbd5e1",
    fontFamily: "var(--font-mono), ui-monospace, monospace",
  },
  hint: { opacity: 0.5, fontSize: "0.75rem", marginTop: "0.5rem" },
};
