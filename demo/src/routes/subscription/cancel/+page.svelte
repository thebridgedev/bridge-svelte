<script lang="ts">
</script>

<div class="cancel-page">
  <div class="cancel-card">
    <h1>Payment cancelled</h1>
    <p>You have cancelled the checkout. No charges were made.</p>
    <a href="/subscription" class="btn-back">Back to plans</a>
  </div>
</div>

<style>
  .cancel-page {
    padding: 4rem 2rem;
    display: flex;
    justify-content: center;
  }

  .cancel-card {
    text-align: center;
    max-width: 400px;
  }

  h1 {
    color: #1f2937;
    margin-bottom: 0.75rem;
  }

  p {
    color: #6b7280;
    margin-bottom: 1.5rem;
  }

  .btn-back {
    display: inline-block;
    padding: 0.625rem 1.25rem;
    background-color: #6b7280;
    color: white;
    border-radius: 0.375rem;
    text-decoration: none;
    font-size: 0.875rem;
  }

  .btn-back:hover {
    background-color: #4b5563;
  }
</style>
