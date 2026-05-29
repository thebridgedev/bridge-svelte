<div class="error-page">
  <div class="card">
    <div class="icon">⚠</div>
    <h1>We couldn't verify your payment</h1>
    <p>
      Your payment may have gone through, but we weren't able to confirm it right now.
      Please wait a moment and try refreshing, or contact support if this persists.
    </p>
    <div class="actions">
      <a href="/welcome" class="btn btn--primary">Try again</a>
      <a href="mailto:support@example.com" class="btn btn--ghost">Contact support</a>
    </div>
  </div>
</div>

<style>
  .error-page {
    min-height: 100vh;
    background: #f8fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 2.5rem;
    max-width: 440px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }

  .icon {
    font-size: 2.5rem;
    margin-bottom: 1rem;
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 700;
    color: #111827;
    margin: 0 0 0.75rem;
  }

  p {
    color: #6b7280;
    font-size: 0.9rem;
    line-height: 1.6;
    margin: 0 0 1.75rem;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn {
    padding: 0.5rem 1.25rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
  }

  .btn--primary { background: #4f46e5; color: #fff; }
  .btn--primary:hover { background: #4338ca; }
  .btn--ghost { background: #f3f4f6; color: #374151; }
  .btn--ghost:hover { background: #e5e7eb; }
</style>
