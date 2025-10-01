<script>
    import { browser } from '$app/environment';
    import { auth } from '@bridge-svelte/lib/shared/services/auth.service';
    import { onDestroy } from 'svelte';
  
    let timeLeft = '';
    let interval;
  
    function getExpiry() {
      const token = auth.getToken()?.accessToken;
      if (!token) return null;
  
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000;
      } catch {
        return null;
      }
    }
  
    function format(ms) {
      const min = Math.floor(ms / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      return `${min}m ${sec}s`;
    }
  
    function updateCountdown() {
      const expiry = getExpiry();
      if (!expiry) {
        timeLeft = 'N/A';
        return;
      }
  
      const diff = expiry - Date.now();
      timeLeft = diff > 0 ? format(diff) : 'Expired';
    }
  
    function manualRefresh() {
        console.log('manualRefresh');
      const token = auth.getToken();
      if (token?.refreshToken) {
        auth.refreshToken(token.refreshToken);
      }
    }
  
    $: if (browser) {
      updateCountdown();
      clearInterval(interval);
      interval = setInterval(updateCountdown, 1000);
    }
  
    onDestroy(() => clearInterval(interval));
  </script>
  
  <div class="token-status">
    ⏳ Token expires in: {timeLeft}
    <button onclick={manualRefresh}>🔄 Refresh Now</button>
  </div>
  
  <style>
    .token-status {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-size: 0.95rem;
    }
  
    button {
      padding: 0.4rem 0.8rem;
      font-size: 0.9rem;
      background-color: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      cursor: pointer;
    }
  
    button:hover {
      background-color: #e5e7eb;
    }
  </style>
  