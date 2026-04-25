import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section className="not-found-card">
        <p className="not-found-kicker">404</p>
        <h1>This page does not exist.</h1>
        <p>
          The route may have moved, or the connection you are looking for is not
          available yet.
        </p>
        <div className="not-found-actions">
          <Link href="/">Go home</Link>
          <Link href="/waitlist">Join waitlist</Link>
        </div>
      </section>
    </main>
  );
}
